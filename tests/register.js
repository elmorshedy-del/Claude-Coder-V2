const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

// Resolve the Next.js `@/` alias to the src directory for tests
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith('@/')) {
    const resolvedPath = path.join(process.cwd(), 'src', request.slice(2));
    return originalResolveFilename.call(this, resolvedPath, parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions['.ts'] = function (module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  });
  return module._compile(outputText, filename);
};
