import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure-native";

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

// Retrieve AKS credentials properly
const creds = pulumi.output(azure.containerservice.listManagedClusterUserCredentials({
    resourceGroupName: resourceGroup.name,
    resourceName: aksCluster.name,
}));

// Corrected: Extract kubeconfig safely
export const kubeconfig = creds.apply(c => 
    c.kubeconfigs && c.kubeconfigs.length > 0 
        ? pulumi.secret(Buffer.from(c.kubeconfigs[0].value, "base64").toString()) 
        : pulumi.secret("Cluster not ready")
);
