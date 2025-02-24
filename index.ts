import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import * as k8s from "@pulumi/kubernetes";

// Create an Azure Resource Group with explicit location
const resourceGroup = new azure.resources.ResourceGroup("aks-rg-s5", {
    location: "uaenorth", // Specify your Azure region
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
    publicIPAllocationMethod: "Static", // Fixed error: Standard SKU must be Static
});

// Deploy AKS Cluster with App Gateway Ingress Controller (AGIC)
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
        mode: "System", // Ensure at least one system pool
    }],
    enableRBAC: true,
    identity: { type: "SystemAssigned" },
    networkProfile: {
        networkPlugin: "azure",
        serviceCidr: "10.4.0.0/16", // Non-overlapping Service CIDR
    },
});

// Deploy Application Gateway with WAF enabled
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
    frontendIPConfigurations: [{
        name: "appGatewayFrontendIP",
        publicIPAddress: { id: publicIp.id },
    }],
    frontendPorts: [{
        name: "appGatewayFrontendPort",
        port: 80,
    }],
    backendAddressPools: [{
        name: "appGatewayBackendPool", // Fixed error: Added required backend address pool
    }],
    webApplicationFirewallConfiguration: {
        enabled: true,
        firewallMode: "Prevention",
        ruleSetType: "OWASP",
        ruleSetVersion: "3.2", // Required fields
    },
});

// Get AKS credentials correctly
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
