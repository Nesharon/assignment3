import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import * as k8s from "@pulumi/kubernetes";

// Create an Azure Resource Group
const resourceGroup = new azure.resources.ResourceGroup("aks-rg-s5", {
    location: "uaenorth",
});

// Create a Virtual Network & Subnet
const vnet = new azure.network.VirtualNetwork("aks-vnet", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    addressSpace: { addressPrefixes: ["10.3.0.0/16"] },
});

const subnet = new azure.network.Subnet("aks-subnet-s5", {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    addressPrefix: "10.3.1.0/24",
});

// Create a Public IP for Application Gateway
const publicIp = new azure.network.PublicIPAddress("appgw-public-ip", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: { name: "Standard" },
    publicIPAllocationMethod: "Static",
});

// Define names dynamically
const backendAddressPoolName = pulumi.interpolate`${vnet.name}-beap`;
const frontendPortName = pulumi.interpolate`${vnet.name}-feport`;
const frontendIpConfigurationName = pulumi.interpolate`${vnet.name}-feip`;
const httpSettingName = pulumi.interpolate`${vnet.name}-be-htst`;
const listenerName = pulumi.interpolate`${vnet.name}-httplstn`;
const requestRoutingRuleName = pulumi.interpolate`${vnet.name}-rqrt`;

const appGateway = new azure.network.ApplicationGateway("app-gateway-s5", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
        name: "WAF_v2",
        tier: "WAF_v2",
        capacity: 2,
    },
    gatewayIPConfigurations: [{
        name: "appGatewayIpConfig",
        subnet: { id: subnet.id },
    }],
    frontendIPConfigurations: [{  // ✅ Fixed property name
        name: frontendIpConfigurationName,
        publicIPAddress: { id: publicIp.id },
    }],
    frontendPorts: [{
        name: frontendPortName,
        port: 80,
    }],
    backendAddressPools: [{
        name: backendAddressPoolName,
    }],
    backendHttpSettingsCollection: [{  // ✅ Fixed property name
        name: httpSettingName,
        cookieBasedAffinity: "Disabled",
        path: "/",
        port: 80,
        protocol: "Http",
        requestTimeout: 60,
    }],
    httpListeners: [{
        name: listenerName,
        frontendIPConfiguration: { name: frontendIpConfigurationName },  // ✅ Correct reference
        frontendPort: { name: frontendPortName },  // ✅ Correct reference
        protocol: "Http",
    }],
    requestRoutingRules: [{
        name: requestRoutingRuleName,
        priority: 1,
        ruleType: "Basic",
        httpListener: { name: listenerName },  // ✅ Correct reference
        backendAddressPool: { name: backendAddressPoolName },  // ✅ Correct reference
        backendHttpSettings: { name: httpSettingName },  // ✅ Correct reference
    }],
    webApplicationFirewallConfiguration: {
        enabled: true,
        firewallMode: "Prevention",
        ruleSetType: "OWASP",
        ruleSetVersion: "3.2",
    },
});

// ✅ Ensure references are correctly created AFTER appGateway is defined
const httpListener = pulumi.interpolate`${appGateway.id}/httpListeners/${listenerName}`;

const aksCluster = new azure.containerservice.ManagedCluster("aks-cluster-s5", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    dnsPrefix: "myaks",
    agentPoolProfiles: [{
        name: "agentpool",
        count: 2,
        vmSize: "Standard_D2_v2",
        vnetSubnetID: subnet.id,
        osType: "Linux",
        mode: "System",
    }],
    enableRBAC: true,
    identity: { type: "SystemAssigned" },
    networkProfile: {
        networkPlugin: "azure",
        serviceCidr: "10.4.0.0/16",
    },
    addonProfiles: {
        ingressApplicationGateway: {
            enabled: true,
            config: {
                applicationGatewayId: appGateway.id,  
            },
        },
    },
}, { dependsOn: [appGateway] });  

// Get AKS credentials
const creds = pulumi
    .all([resourceGroup.name, aksCluster.name])
    .apply(([rgName, aksName]) =>
        azure.containerservice.listManagedClusterUserCredentials({
            resourceGroupName: rgName,
            resourceName: aksName,
        })
    );

// Export kubeconfig for kubectl access
const kubeconfig = creds.apply(c => {
    const encoded = c.kubeconfigs?.[0]?.value || "";
    return Buffer.from(encoded, "base64").toString();
});

export const kubeconfigSecret = pulumi.secret(kubeconfig);
