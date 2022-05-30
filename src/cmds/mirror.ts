import debug = require("debug");
import yargs = require("yargs");
import { CommandResult, SupportedIntegrationTypesImportData, SupportedIntegrationTypesImportOrgData } from "../lib/types";
import { generateOrgImportDataFile } from "../scripts/generate-org-data";
import { generateOrgImportData } from "./orgs:data";
import { createOrg } from "./orgs:create";
import { importFunction } from "./import";

export const command = ['mirror'];
export const desc =
  'mirror the 3 commands: orgs:data, orgs:create and import. Get the data from the source, create matching organisation into snyk and import the data';

  export const builder = {
    snykGroupId: {
        required: true,
        default: undefined,
        desc: 'Public id of the group in Snyk (available on group settings)',
    },
    source: {
        required: true,
        default: SupportedIntegrationTypesImportData.GITHUB,
        choices: [...Object.values(SupportedIntegrationTypesImportData)],
        desc:
            'The source of the targets to be imported e.g. Github, Github Enterprise, Gitlab, Azure. This will be used to make an API call to list all available entities per org',
    },
    sourceUrl: {
        required: false,
        default: undefined,
        desc:
            'Custom base url for the source API that can list organizations (e.g. Github Enterprise url)',
    },
    snykIntegrationName: {
        required: false,
        default: undefined,
        choices: [...Object.values(SupportedIntegrationTypesImportData)],
        desc:
            'The configured integration type on the created Snyk Org to use for generating import targets data. Applies to all targets.',
    },
    sourceOrgPublicId: {
        required: false,
        default: undefined,
        desc:
          'Public id of the organization in Snyk that can be used as a template to copy all supported organization settings.',
    },
};

export async function handler(argv: {
    groupId: string;
    source: SupportedIntegrationTypesImportOrgData;
    snykTemplateOrgPublicId?: string;
    sourceUrl?: string;
    snykIntegrationName?: string; 
}): Promise<void> {

    const { groupId, source, snykTemplateOrgPublicId, sourceUrl, snykIntegrationName } = argv;
    debug('ℹ️  Options: ' + JSON.stringify(argv));

    let integrationType = source
    if (snykIntegrationName != undefined) {
        integrationType = snykIntegrationName as SupportedIntegrationTypesImportOrgData
    }

    let defaultSourceUrl = source
    if (sourceUrl != undefined) {
        defaultSourceUrl = sourceUrl as SupportedIntegrationTypesImportOrgData
    } 
        
    const generateOrgImportDataResult = await generateOrgImportData(source,
        groupId,
        snykTemplateOrgPublicId,
        defaultSourceUrl,
        true) 

    if (generateOrgImportDataResult.exitCode === 1 ) {
      debug('Failed to import data from source.\n' + generateOrgImportDataResult.message);
  
      console.error(generateOrgImportDataResult.message);
      setTimeout(() => yargs.exit(1, new Error(generateOrgImportDataResult.message)), 3000);
    } 
      
    console.log(generateOrgImportDataResult.message);
      
    let createOrgFile = {} as CommandResult
    if (generateOrgImportDataResult.fileName) {
        createOrgFile = await createOrg(
            generateOrgImportDataResult.fileName,
          true,
          true,
        );
    }    
  
    if (createOrgFile.exitCode === 1) {
      debug('Failed to create organizations.\n' + createOrgFile.message);
  
      console.error(createOrgFile.message);
      setTimeout(() => yargs.exit(1, new Error(createOrgFile.message)), 3000);
    } else {
      console.log(createOrgFile.message);
    }


    let ImportFile = {} as CommandResult
    if (createOrgFile.fileName) {
      ImportFile = await importFunction(
        createOrgFile.fileName
        );
    }    
  
    if (ImportFile.exitCode === 1) {
      debug('Failed to import projects.\n' + ImportFile.message);
  
      console.error(ImportFile.message);
      setTimeout(() => yargs.exit(1, new Error(ImportFile.message)), 3000);
    } else {
      console.log(ImportFile.message);
    }
  }


