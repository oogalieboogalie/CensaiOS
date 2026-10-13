const pathProperty = {
  type: 'string',
  description: 'Path to the file to scan',
};

const testPathProperty = {
  type: 'string',
  description: 'Path to the file for which to generate tests',
};

const frameworkProperty = {
  type: 'string',
  enum: ['jest', 'pytest'],
  description: 'Test framework to use',
};

function objectSchema(properties, required) {
  return {
    type: 'object',
    properties,
    required,
  };
}

function toolDefinition(name, description, parameters) {
  return {
    type: 'function',
    function: { name, description, parameters },
  };
}

const scanReliabilityParameters = objectSchema({ path: pathProperty }, ['path']);
const generateTestsParameters = objectSchema({
  path: testPathProperty,
  framework: frameworkProperty,
}, ['path']);

export const reliabilityTools = [
  toolDefinition(
    'scan_reliability',
    'Scans a file for AI-authored code reliability issues and returns a score.',
    scanReliabilityParameters
  ),
  toolDefinition(
    'generate_tests',
    'Generates unit tests for a file to improve its reliability score.',
    generateTestsParameters
  ),
];
