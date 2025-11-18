# Serverless AWS Lookup Plugin

A Serverless Framework plugin that resolves ARNs (and other primitive fields) of AWS resources by their 
names/ids at deploy time via configuration variables.

Especially useful to link Serverless-managed stacks to existing resources with a different lifecycle 
managed outside of Serverless e.g. by Terraform.

## Overview

This plugin adds configuration variable support like:

- `${aws-lookup(dynamodb-table-by-name, MyTableName)}` → resolves to the DynamoDB table ARN
- `${aws-lookup(wafv2-ipset-regional-by-name, my-ipset)}` → resolves to the regional WAFv2 IPSet ARN

You can also drill down into nested fields using an address suffix after a colon, for example:

- `${aws-lookup(wafv2-ipset-regional-by-name, my-ipset):Id}`
- `${aws-lookup(dynamodb-table-by-name, MyTableName):Table.TableStatus}`

If no address is provided, each resolver has a sensible default field to return - usually the ARN.

## Requirements

- Node.js `>= 18.20.3` - as required by the Serverless Framework
- Serverless Framework v3 or v4 installed in your service
- AWS credentials with permissions to call the relevant AWS APIs - the usual that you'd need to work with Serverless

## Usage

Add the plugin to your Serverless service and configure variables:
```yaml
service: my-service
provider:
  name: aws
  region: us-east-1
custom:
  myTableArn: ${aws-lookup(dynamodb-table-by-name, MyTableName)}
  myWafIpSetArn: ${aws-lookup(wafv2-ipset-regional-by-name, my-ipset)}
plugins:
  - serverless-aws-lookup-plugin
```

## Supported Resolvers

The following resolvers are currently built-in (see `RESOLVERS` in `src/index.js`):

- `dynamodb-table-by-name` - calls `DynamoDB` service `describeTable` with `TableName`
- `wafv2-ipset-regional-by-name` - calls `WAFV2` service `listIPSets` with `Scope: REGIONAL` and matches on `Name`
- `wafv2-webacl-regional-by-name` - calls `WAFV2` service `listWebACLs` with `Scope: REGIONAL` and matches on `Name`

General notes:
- Matching resolvers that list resources will throw if multiple resources with the same name are found.
- If no match is found, resolution fails with a clear error.
- Only primitive results (string/number/boolean/bigint) are returned; non-primitive results cause an error.

## Development and contributions

**New resolvers welcome as contributions/PRs**

### Debugging
To see debug logs from the plugin:
```bash
sls info --stage=dev --debug=plugin
# or further limit debug output to specific plugin
sls info --stage=dev --debug=plugin:<plugin-name>
```
