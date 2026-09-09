const BINARY_EXT = /\.(png|jpe?g|gif|ico|icns|webp|woff2?|ttf|eot|pdf|zip|gz|tar|xlsx?|docx|pptx|mp[34]|wasm)$/i;

export function isBinaryFile(file) {
  return BINARY_EXT.test(String(file || ''));
}
