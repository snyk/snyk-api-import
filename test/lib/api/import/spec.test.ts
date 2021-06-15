import {groupByOrgAndIntegration} from '../../../../src/lib/api/import'

describe('groupByOrgAndIntegration', () => {
  it('Should create one group if all is the same', () => {
    const output = groupByOrgAndIntegration([
      {
        integrationId: "some-integration",
        orgId: "some-org",
        target: {
          name: "hello"
        }
      },
      {
        integrationId: "some-integration",
        orgId: "some-org",
        target: {
          name: "hello"
        }
      },
      {
        integrationId: "some-integration",
        orgId: "some-org",
        target: {
          name: "hello"
        }
      },
    ], 100)

    expect(Object.keys(output)).toHaveLength(1)
    expect(Object.prototype.hasOwnProperty.call(output, "some-org#some-integration#1")).toBeTruthy()
    expect(output["some-org#some-integration#1"]).toHaveLength(3)
  })

  it('Should create multiple keys if capacity exceed limit', () => {
    const output = groupByOrgAndIntegration([
      {
        integrationId: "some-integration",
        orgId: "some-org",
        target: {
          name: "hello"
        }
      },
      {
        integrationId: "some-integration",
        orgId: "some-org",
        target: {
          name: "hello"
        }
      },
      {
        integrationId: "some-integration",
        orgId: "some-org",
        target: {
          name: "hello"
        }
      },
      {
        integrationId: "some-integration",
        orgId: "some-org",
        target: {
          name: "hello"
        }
      },
    ], 1)

    console.error(JSON.stringify(output))

    expect(Object.keys(output)).toHaveLength(4);

    [
      "some-org#some-integration#1", 
      "some-org#some-integration#2", 
      "some-org#some-integration#3", 
      "some-org#some-integration#4"
    ].forEach(key => {
      expect(Object.prototype.hasOwnProperty.call(output, key)).toBeTruthy()
      expect(output[key]).toHaveLength(1)
    })
  })

  it('Should create one key per intergration/org', () => {
    const output = groupByOrgAndIntegration([
      {
        integrationId: "some-integration",
        orgId: "some-org",
        target: {
          name: "hello"
        }
      },
      {
        integrationId: "some-integration1",
        orgId: "some-org",
        target: {
          name: "hello"
        }
      },
      {
        integrationId: "some-integration",
        orgId: "some-org1",
        target: {
          name: "hello"
        }
      },
      {
        integrationId: "some-integration1",
        orgId: "some-org1",
        target: {
          name: "hello"
        }
      },
    ], 100)

    expect(Object.keys(output)).toHaveLength(4);

    [
      "some-org#some-integration#1", 
      "some-org#some-integration1#1", 
      "some-org1#some-integration1#1", 
      "some-org1#some-integration#1"
    ].forEach(key => {
      expect(Object.prototype.hasOwnProperty.call(output, key)).toBeTruthy()
      expect(output[key]).toHaveLength(1)
    })
  })
})