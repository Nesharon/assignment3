import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";
import * as k8s from "@pulumi/kubernetes";

// Create an Azure Resource Group
const resourceGroup = new azure.resources.ResourceGroup("aks-rg-s5");

// Create a Virtual Network & Subnet
const vnet = new azure.network.VirtualNetwork("aks-vnet", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    addressSpace: { addressPrefixes: ["10.0.0.0/16"] },
});

const subnet = new azure.network.Subnet("aks-subnet-s5", {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    addressPrefix: "10.0.1.0/24",
});

// Deploy AKS Cluster
const aksCluster = new azure.containerservice.ManagedCluster("aks-cluster-s5", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    dnsPrefix: "myaks",
    agentPoolProfiles: [{
        name: "agentpool",
        count: 2,
        vmSize: "Standard_D2_v2",
        vnetSubnetID: subnet.id,
    }],
    enableRBAC: true,
    identity: { type: "SystemAssigned" },
    networkProfile: {
        networkPlugin: "azure",
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
    webApplicationFirewallConfiguration: {
        enabled: true,
        firewallMode: "Prevention",
        ruleSetType: "OWASP", // Required field
        ruleSetVersion: "3.2", // Required field
    },
});

// Export kubeconfig for kubectl access
export const kubeconfig = aksCluster.provisioningState.apply(state =>
    state === "Succeeded"
        ? pulumi.secret(aksCluster.accessProfiles!["clusterAdmin"].kubeConfig)
        : pulumi.secret("Cluster is still provisioning...")
);
