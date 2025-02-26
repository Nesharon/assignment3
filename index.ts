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
    addressSpace: { addressPrefixes: ["10.1.0.0/16"] },
});

const subnet = new azure.network.Subnet("aks-subnet", {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    addressPrefix: "10.1.1.0/24",
});

// Create a Public IP for Application Gateway
const publicIp = new azure.network.PublicIPAddress("appgw-public-ip", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: { name: "Standard" },
    publicIPAllocationMethod: "Static",
});

// Create a Web Application Firewall Policy
const wafPolicy = new azure.network.WebApplicationFirewallPolicy("wafPolicy", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    policyName: "example-waf-policy",
    managedRules: {
        managedRuleSets: [{
            ruleSetType: "OWASP",
            ruleSetVersion: "3.2",
        }],
    },
});

// ✅ Move App Gateway Definition Before Using It
const appGateway = new azure.network.ApplicationGateway("AppGateway", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
        name: "WAF_v2",
        tier: "WAF_v2",
    },
    firewallPolicy: {
        id: wafPolicy.id,
    },
    gatewayIPConfigurations: [{
        name: "appGwIpConfig",
        subnet: {
            id: subnet.id,
        },
    }],
    frontendIPConfigurations: [{
        name: "appGwFrontendIP",
        publicIPAddress: {
            id: publicIp.id,
        },
    }],
    frontendPorts: [{
        name: "appGwFrontendPort",
        port: 80,
    }],
    backendAddressPools: [{
        name: "appGwBackendPool",
        backendAddresses: [
            { ipAddress: "10.0.0.1" },
        ],
    }],
    backendHttpSettingsCollection: [{
        name: "appGwBackendHttpSettings",
        port: 80,
        protocol: "Http",
    }],
    httpListeners: [{
        name: "appGwHttpListener",
        frontendIPConfiguration: pulumi.output(appGateway.id).apply(id => ({
            id: `${id}/frontendIPConfigurations/appGwFrontendIP`,
        })),
        frontendPort: pulumi.output(appGateway.id).apply(id => ({
            id: `${id}/frontendPorts/appGwFrontendPort`,
        })),
        protocol: "Http",
    }],
    urlPathMaps: [{
        name: "appGwUrlPathMap",
        defaultBackendAddressPool: pulumi.output(appGateway.id).apply(id => ({
            id: `${id}/backendAddressPools/appGwBackendPool`,
        })),
        defaultBackendHttpSettings: pulumi.output(appGateway.id).apply(id => ({
            id: `${id}/backendHttpSettingsCollection/appGwBackendHttpSettings`,
        })),
    }],
});

// ✅ Now use the appGateway reference inside the AKS cluster
const aksCluster = new azure.containerservice.ManagedCluster("aks-cluster", {
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
        serviceCidr: "10.0.0.0/16",
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

// ✅ Export Statements After Everything is Defined
export const kubeconfigSecret = pulumi.secret(kubeconfig);
export const aksClusterName = aksCluster.name;
export const frontendPortId = pulumi.output(appGateway.frontendPorts[0].id);
export const frontendIpConfigId = pulumi.output(appGateway.frontendIPConfigurations[0].id);
