import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure";
import * as azureNative from "@pulumi/azure-native";

// Configuration
const config = new pulumi.Config();
const location = config.get("location") || "uaenorth";

// Resource Group
const resourceGroup = new azure.core.ResourceGroup("appGwResourceGroup", {
    location: location,
});

// Virtual Network
const virtualNetwork = new azure.network.VirtualNetwork("appGwVNet", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    addressSpaces: ["10.0.0.0/16"],
});

// Subnet
const subnet = new azure.network.Subnet("appGwSubnet", {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: virtualNetwork.name,
    addressPrefixes: ["10.0.2.0/24"],
});

// Public IP
const publicIp = new azure.network.PublicIp("appGwPublicIP", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    allocationMethod: "Dynamic",
});

// Web Application Firewall Policy
const wafPolicy = new azure.network.ApplicationGatewayFirewallPolicy("wafPolicy", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: "Standard_v2", // WAF_v2 uses Standard_v2 SKU
    policySettings: {
        enabled: true,
        mode: "Prevention", // Prevention mode blocks attacks
        requestBodyCheck: true,
        maxRequestBodySizeInKb: 128,
    },
    managedRules: [{
        type: "OWASP",
        version: "3.2",
    }],
});

// Application Gateway with WAF_v2 SKU
const appGateway = new azure.network.ApplicationGateway("appGateway", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
        name: "WAF_v2",
        tier: "WAF_v2",
        capacity: 2,
    },
    firewallPolicyId: wafPolicy.id, // Attach WAF Policy
    gatewayIpConfigurations: [{
        name: "appGwIPConfig",
        subnetId: subnet.id,
    }],
    frontendIpConfigurations: [{
        name: "appGwFrontendIPConfig",
        publicIpAddressId: publicIp.id,
    }],
    frontendPorts: [{
        name: "httpPort",
        port: 80,
    }],
    backendAddressPools: [{
        name: "appGwBackendPool",
    }],
    backendHttpSettings: [{
        name: "httpSettings",
        port: 80,
        protocol: "Http",
        requestTimeout: 20,
        cookieBasedAffinity: "Disabled",
    }],
    httpListeners: [{
        name: "httpListener",
        frontendIpConfigurationName: "appGwFrontendIPConfig",
        frontendPortName: "httpPort",
        protocol: "Http",
    }],
    requestRoutingRules: [{
        name: "rule1",
        ruleType: "Basic",
        httpListenerName: "httpListener",
        backendAddressPoolName: "appGwBackendPool",
        backendHttpSettingsName: "httpSettings",
        priority: 100,
    }],
});

// Export Outputs
export const appGatewayIp = publicIp.ipAddress;
export const appGatewayId = appGateway.id;


// Export Outputs
export const appGatewayIp = publicIp.ipAddress;
export const appGatewayId = appGateway.id;

// import * as pulumi from "@pulumi/pulumi";
// import * as azure from "@pulumi/azure-native";
// import * as k8s from "@pulumi/kubernetes";

// // Create an Azure Resource Group
// const resourceGroup = new azure.resources.ResourceGroup("aks-rg-s5", {
//     location: "uaenorth",
// });

// // Create a Virtual Network & Subnet
// const vnet = new azure.network.VirtualNetwork("aks-vnet", {
//     resourceGroupName: resourceGroup.name,
//     location: resourceGroup.location,
//     addressSpace: { addressPrefixes: ["10.1.0.0/16"] },
// });

// const subnet = new azure.network.Subnet("aks-subnet", {
//     resourceGroupName: resourceGroup.name,
//     virtualNetworkName: vnet.name,
//     addressPrefix: "10.1.1.0/24",
// });

// // Create a Public IP for Application Gateway
// const publicIp = new azure.network.PublicIPAddress("appgw-public-ip", {
//     resourceGroupName: resourceGroup.name,
//     location: resourceGroup.location,
//     sku: { name: "Standard" },
//     publicIPAllocationMethod: "Static",
// });

// // Create a Web Application Firewall Policy
// const wafPolicy = new azure.network.WebApplicationFirewallPolicy("wafPolicy", {
//     resourceGroupName: resourceGroup.name,
//     location: resourceGroup.location,
//     policyName: "example-waf-policy",
//     managedRules: {
//         managedRuleSets: [{
//             ruleSetType: "OWASP",
//             ruleSetVersion: "3.2",
//         }],
//     },
// });

// const frontendIpConfigName = "appGwFrontendIP";
// const frontendPortName = "appGwFrontendPort";
// const backendPoolName = "appGwBackendPool";
// const backendHttpSettingsName = "appGwBackendHttpSettings";
// const httpListenerName = "httpListener";
// const urlPathMapName = "urlPathMap";

// // Define the Application Gateway as a single resource
// const appGateway = new azure.network.ApplicationGateway("appGateway", {
//     resourceGroupName: resourceGroup.name,
//     location: resourceGroup.location,
//     sku: { name: "WAF_v2", tier: "WAF_v2" },
    
//     gatewayIPConfigurations: [{
//         name: "appGwIpConfig",
//         subnet: { id: subnet.id },
//     }],
    
//     frontendIPConfigurations: [{
//         name: frontendIpConfigName,
//         publicIPAddress: { id: publicIp.id },
//     }],
    
//     frontendPorts: [{ name: frontendPortName, port: 80 }],
    
//     backendAddressPools: [{ name: backendPoolName }],
    
//     backendHttpSettingsCollection: [{
//         name: backendHttpSettingsName,
//         port: 80,
//         protocol: "Http",
//     }],
    
//     // ✅ Define httpListeners and urlPathMaps **inside** Application Gateway
//     httpListeners: [{
//         name: httpListenerName,
//         frontendIpConfigurationName: { id: `${id}/frontendIPConfigurations/${frontendIpConfigurationName}` }, 
//         frontendPortName: { id: `${id}/frontendPorts/${frontendPortName}` },
//         protocol: "Http",     
//     }],
    
//     urlPathMaps: [{
//           name: requestRoutingRuleName,
//         priority: 9,
//         ruleType: "Basic",
//         httpListener: { id: `${id}/httpListeners/${httpListenerName}` }, // ✅ Fix
//         backendAddressPool: { id: `${id}/backendAddressPools/${backendPoolName}` }, // ✅ Fix
//         backendHttpSettings: { id: `${id}/backendHttpSettingsCollection/${httpSettingName}` }, // ✅ Fix
//     }],
// });

// // ✅ Now use the appGateway reference inside the AKS cluster
// const aksCluster = new azure.containerservice.ManagedCluster("aks-cluster", {
//     resourceGroupName: resourceGroup.name,
//     location: resourceGroup.location,
//     dnsPrefix: "myaks",
//     agentPoolProfiles: [{
//         name: "agentpool",
//         count: 2,
//         vmSize: "Standard_D2_v2",
//         vnetSubnetID: subnet.id,
//         osType: "Linux",
//         mode: "System",
//     }],
//     enableRBAC: true,
//     identity: { type: "SystemAssigned" },
//     networkProfile: {
//         networkPlugin: "azure",
//         serviceCidr: "10.0.0.0/16",
//     },
//     addonProfiles: {
//         ingressApplicationGateway: {
//             enabled: true,
//             config: {
//                 applicationGatewayId: appGateway.id,
//             },
//         },
//     },
// }, { dependsOn: [appGateway] });

// // Get AKS credentials
// const creds = pulumi
//     .all([resourceGroup.name, aksCluster.name])
//     .apply(([rgName, aksName]) =>
//         azure.containerservice.listManagedClusterUserCredentials({
//             resourceGroupName: rgName,
//             resourceName: aksName,
//         })
//     );

// // Export kubeconfig for kubectl access
// const kubeconfig = creds.apply(c => {
//     const encoded = c.kubeconfigs?.[0]?.value || "";
//     return Buffer.from(encoded, "base64").toString();
// });

// // ✅ Export Statements After Everything is Defined
// export const kubeconfigSecret = pulumi.secret(kubeconfig);
// export const aksClusterName = aksCluster.name;
// export const frontendPortId = pulumi.output(appGateway.frontendPorts[0].id);
// export const frontendIpConfigId = pulumi.output(appGateway.frontendIPConfigurations[0].id);
