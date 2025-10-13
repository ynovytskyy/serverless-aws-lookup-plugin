'use strict'

class AwsLookupPlugin {
    static RESOLVERS = {
        // serverless for its AWS provider request call uses JS SDK V2 style names
        // look up service, command, params and fields from https://docs.aws.amazon.com/AWSJavaScriptSDK/latest/
        'dynamodb-table-by-name': {
            service: 'DynamoDB',
            command: 'describeTable',
            keyParamName: 'TableName',
            defaultReturnFieldName: 'Table.TableArn',
        },
        'wafv2-ipset-regional-by-name': {
            service: 'WAFV2',
            command: 'listIPSets',
            params: { Scope: 'REGIONAL' },
            matchFieldName: 'Name',
            collectionFieldName: 'IPSets',
            defaultReturnFieldName: 'ARN',
        },
    }

    constructor(serverless, options, { log }) {
        this.log = log
        this.log.debug('Creating AwsLookupPlugin')
        this.serverless = serverless
        this.provider = serverless.providers.aws
        this.configurationVariablesSources = {
            'aws-lookup': {
                resolve: async (variable) => {
                    if (!variable.params || variable.params.length !== 2) {
                        throw new this.serverless.classes.Error('Resolver name and key expected as 2 parameters ' +
                            'for AWS Lookup Plugin. E.g. ${aws-lookup(wafv2-ipset-regional-by-name, my-ipset)}');
                    }
                    const resolverName = variable.params[0]
                    const key = variable.params[1]
                    const resolverInfo = AwsLookupPlugin.RESOLVERS[resolverName]
                    if (!resolverInfo) {
                        throw new this.serverless.classes.Error(`No resolver found for '${resolverName}'`);
                    }
                    const returnFieldName = variable.address || resolverInfo.defaultReturnFieldName
                    this.log.debug(`Looking up '${resolverName}' by '${key}' for '${returnFieldName}'...`)

                    let result = null
                    try {
                        if (resolverInfo.keyParamName) {
                            result = await this.byId(resolverInfo.service, resolverInfo.command,
                                resolverInfo.keyParamName, key, returnFieldName)
                        } else if (resolverInfo.matchFieldName) {
                            result = await this.byMatch(resolverInfo.service, resolverInfo.command,
                                resolverInfo.params, resolverInfo.collectionFieldName, resolverInfo.matchFieldName,
                                key, returnFieldName)
                        } else {
                            throw new Error(`Misconfigured resolver: '${resolverName}'`);
                        }
                    } catch (ex) {
                        throw new this.serverless.classes.Error(`Failed to look up '${resolverName}' ` +
                            `by '${key}' for '${returnFieldName}'. Cause: ${ex.message}`)
                    }

                    if (!AwsLookupPlugin.isPrimitiveValue(result)) {
                        throw new this.serverless.classes.Error(`Value for '${resolverName}' by '${key}' ` +
                            `for '${returnFieldName}' is not a primitive: '${result}'`)
                    }
                    this.log.verbose(`Looked up '${resolverName}' by '${key}' for '${returnFieldName}': '${result}'`)
                    return {value: result}
                }
            }
        }
    }

    async byId(service, command, keyParamName, keyParamValue, returnFieldName) {
        const params = {
            [keyParamName]: keyParamValue
        }
        this.log.debug(`Requesting service='${service}', command='${command}', ` +
            `parameters='${JSON.stringify(params)}'`)
        const response = await this.provider.request(service, command, params)
        this.log.debug(`Matching resource(s):\n${JSON.stringify(response, null, 2)}`)
        return AwsLookupPlugin.drillDown(response, returnFieldName)
    }

    async byMatch(service, call, params, collectionFieldName, matchFieldName, matchValue, returnFieldName) {
        const collection = await this.requestAll(service, call, params, collectionFieldName)
        let matchingResource = null
        for (const item of collection) {
            const itemMatchFieldValue = item[matchFieldName]
            if (itemMatchFieldValue === matchValue) {
                if (matchingResource) {
                    throw new Error(`Multiple resources found with '${matchFieldName}' equal to '${matchValue}'`)
                } else {
                    matchingResource = item
                }
            }
        }
        this.log.debug(`Matching resource(s):\n${JSON.stringify(matchingResource, null, 2)}`)
        if (!matchingResource) {
            throw new Error(`No resources found with '${matchFieldName}' equal to '${matchValue}'`)
        }
        return AwsLookupPlugin.drillDown(matchingResource, returnFieldName)
    }

    async requestAll(service, command, params, collectionFieldName) {
        const all = []
        let nextMarker = null
        do {
            if (nextMarker) {
                params.NextMarker = nextMarker
            }
            this.log.debug(`Requesting service='${service}', command='${command}', ` +
                `parameters='${JSON.stringify(params)}'`)
            const response = await this.provider.request(service, command, params)
            const page = response[collectionFieldName] || []
            all.push(...page)
            nextMarker = response.NextMarker
        } while (nextMarker)
        return all
    }

    static drillDown(obj, path) {
        let result = obj
        for (const key of path.split('.')) {
            result = result?.[key]
            if (result === undefined) break
        }
        return result
    }

    static isPrimitiveValue(value) {
        const type = typeof value
        return type === 'string' || type === 'number' || type === 'boolean' || type === 'bigint'
    }
}

module.exports = AwsLookupPlugin
