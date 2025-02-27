import * as pulumi from "@pulumi/pulumi";
import * as azure from "@pulumi/azure";
import * as azureNative from "@pulumi/azure-native";

// Configuration
const config = new pulumi.Config();
const location = config.get("location") || "uaenorth";

// Create Resource Group
const resourceGroup = new azure.core.ResourceGroup("aks-rg-s5", {
    location: location,
});

// Virtual Network
const vnet = new azure.network.VirtualNetwork("aks-vnet", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    addressSpaces: ["10.1.0.0/16"],
});

// Subnet
const subnet = new azure.network.Subnet("aks-subnet", {
    resourceGroupName: resourceGroup.name,
    virtualNetworkName: vnet.name,
    addressPrefixes: ["10.1.1.0/24"],
});

// Public IP
const publicIp = new azure.network.PublicIp("appgw-public-ip", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    allocationMethod: "Static",
    sku: "Standard",
});

// WAF Policy
const wafPolicy = new azureNative.network.WebApplicationFirewallPolicy("wafPolicy", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    policySettings: {
        mode: "Prevention",
        requestBodyCheck: true,
    },
    managedRules: {
        managedRuleSets: [{
            ruleSetType: "OWASP",
            ruleSetVersion: "3.2",
        }],
    },
});

// Application Gateway
const appGateway = new azure.network.ApplicationGateway("appGateway", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    sku: {
        name: "WAF_v2",
        tier: "WAF_v2",
        capacity: 2,
    },
    firewallPolicyId: wafPolicy.id.apply(id =>
        id.replace("/ApplicationGatewayWebApplicationFirewallPolicies/", "/applicationGatewayWebApplicationFirewallPolicies/")
    ),
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

// AKS Cluster
const aksCluster = new azure.containerservice.KubernetesCluster("aks-cluster", {
    resourceGroupName: resourceGroup.name,
    location: resourceGroup.location,
    dnsPrefix: "myaks",
    defaultNodePool: {
        name: "agentpool",
        nodeCount: 2,
        vmSize: "Standard_D2_v2",
        vnetSubnetId: subnet.id,
    },
    identity: { type: "SystemAssigned" },
    networkProfile: {
        networkPlugin: "azure",
        serviceCidr: "10.0.0.0/16",
    },
    ingressApplicationGateway: {
        enabled: true,
        gatewayId: appGateway.id,
    },
}, { dependsOn: [appGateway] });

// AKS Credentials
const creds = pulumi
    .all([resourceGroup.name, aksCluster.name])
    .apply(([rgName, aksName]) =>
        azure.containerservice.getKubernetesClusterCredentials({
            resourceGroupName: rgName,
            name: aksName,
        })
    );

const kubeconfig = creds.apply(c => Buffer.from(c.kubeconfigs[0].value, "base64").toString());

// Exports
export const kubeconfigSecret = pulumi.secret(kubeconfig);
export const appGatewayIp = publicIp.ipAddress;
export const aksClusterName = aksCluster.name;
