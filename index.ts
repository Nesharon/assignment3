import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import * as k8s from "@pulumi/kubernetes";

// Create an Azure Resource Group
const resourceGroup = new azure.resources.ResourceGroup("aks-rg", {
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

// // Create the AKS Cluster
// const aksCluster = new azure.containerservice.ManagedCluster("myAksCluster", {
//     resourceGroupName: resourceGroup.name,
//     location: resourceGroup.location,
//     kubernetesVersion: "1.21.2", // Choose the desired Kubernetes version
//     dnsPrefix: "akscluster",
//     agentPoolProfiles: [{
//         name: "default",
//         count: 3,
//         vmSize: "Standard_DS2_v2",
//         osType: "Linux",
//     }],
//     enableRBAC: true,
//     networkProfile: {
//         networkPlugin: "azure", // Use Azure CNI networking
//         networkPolicy: "calico", // You can choose the policy like calico for network security
//     },
//     identity: {
//         type: "SystemAssigned", // AKS system-assigned identity
//     },
// });


// const backendAddressPoolName = "appgw-beap";
// const frontendPortName = "appgw-feport";
// const frontendIpConfigurationName = "appgw-feip";
// const httpSettingName = "appgw-be-htst";
// const listenerName = "appgw-httplstn";
// const requestRoutingRuleName = "appgw-rqrt";
// const httpListeners = "appw-httpl"

// // Create an Application Gateway
// const appGateway = new azure.network.ApplicationGateway("app-gateway", {
//     resourceGroupName: resourceGroup.name,
//     location: resourceGroup.location,
//     sku: {
//         name: "WAF_v2",
//         tier: "WAF_v2",
//         capacity: 2,
//     },
//     gatewayIPConfigurations: [{
//         name: "appGatewayIpConfig",
//         subnet: { id: subnet.id },
//     }],
//     frontendIPConfigurations: [{
//         name: "appgw-feip",
//         publicIPAddress: { id: publicIp.id },
//     }],
//     frontendPorts: [{
//         name: "appgw-feport",
//         port: 80,
//     }],
//     backendAddressPools: [{
//         name: "appgw-beap",
//     }],
//     backendHttpSettingsCollection: [{
//         name: "appgw-be-htst",
//         port: 80,
//         protocol: "Http",
//         requestTimeout: 60,
//     }],
//     httpListeners: [{
//         name: "appgw-httplstn",
//         frontendIPConfiguration: { id: pulumi.interpolate`${appGateway.id}/frontendIPConfigurations/appgw-feip` },
//         frontendPort: { id: pulumi.interpolate`${appGateway.id}/frontendPorts/appgw-feport` },
//         protocol: "Http",
//     }],
//     requestRoutingRules: [{
//         name: "appgw-rqrt",
//         priority: 1,
//         ruleType: "Basic",
//         httpListener: { id: pulumi.interpolate`${appGateway.id}/httpListeners/appgw-httplstn` },
//         backendAddressPool: { id: pulumi.interpolate`${appGateway.id}/backendAddressPools/appgw-beap` },
//         backendHttpSettings: { id: pulumi.interpolate`${appGateway.id}/backendHttpSettingsCollection/appgw-be-htst` },
//     }],
//     webApplicationFirewallConfiguration: {
//         enabled: true,
//         firewallMode: "Prevention",
//         ruleSetType: "OWASP",
//         ruleSetVersion: "3.2",
//     },
// });

// Create an AKS Cluster with Application Gateway Ingress Controller
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
        serviceCidr: "10.2.0.0/16",
    },
    // addonProfiles: {
    //     ingressApplicationGateway: {
    //         enabled: true,
    //         config: {
    //             applicationGatewayId: appGateway.id,
    //         },
    //     },
    // },
});
// { dependsOn: [appGateway] });

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

