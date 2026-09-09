import {
  parseLongcatToolCalls,
  withLongcatToolCallFallback,
} from '../server/routes/chat/longcatToolCalls.js';

describe('parseLongcatToolCalls', () => {
  it('should return null for non-strings or content without longcattoolcall tag', () => {
    expect(parseLongcatToolCalls(null)).toBeNull();
    expect(parseLongcatToolCalls(undefined)).toBeNull();
    expect(parseLongcatToolCalls(123)).toBeNull();
    expect(parseLongcatToolCalls('hello world')).toBeNull();
  });

  it('should parse a single longcattoolcall correctly', () => {
    const content = `
K so I see what happened. Let me fix this properly.
<longcattoolcall>project_edit
<longcatargkey>project</longcatargkey>
<longcatargvalue>Homebase</longcatargvalue>
<longcatargkey>path</longcatargkey>
<longcatargvalue>src/components/terminal/useTerminal.js</longcatargvalue>
<longcatargkey>oldstring</longcatarg_key>
<longcatargvalue>import { FitAddon } from '@xterm/addon-fit';</longcatargvalue>
<longcatargkey>newstring</longcatarg_key>
<longcatargvalue>import { FitAddon } from '@xterm/addon-fit';
import { ClipboardAddon } from '@xterm/addon-clipboard';</longcatargvalue>
</longcattoolcall>
`;

    const result = parseLongcatToolCalls(content);
    expect(result).toHaveLength(1);
    expect(result[0].function.name).toBe('project_edit');
    
    const args = JSON.parse(result[0].function.arguments);
    expect(args.project).toBe('Homebase');
    expect(args.path).toBe('src/components/terminal/useTerminal.js');
    expect(args.oldstring).toBe("import { FitAddon } from '@xterm/addon-fit';");
    expect(args.newstring).toBe("import { FitAddon } from '@xterm/addon-fit';\nimport { ClipboardAddon } from '@xterm/addon-clipboard';");
  });

  it('should handle case insensitivity and underscore variations in tags', () => {
    const content = `
<LONGCATTOOLCALL>test_tool
<longcatargkey>foo</longcatarg_key>
<longcatargvalue>bar</longcatarg_value>
</LONGCATTOOLCALL>
`;

    const result = parseLongcatToolCalls(content);
    expect(result).toHaveLength(1);
    expect(result[0].function.name).toBe('test_tool');
    
    const args = JSON.parse(result[0].function.arguments);
    expect(args.foo).toBe('bar');
  });

  it('should parse multiple toolcalls sequentially', () => {
    const content = `
<longcattoolcall>tool_one
<longcatargkey>key1</longcatargkey>
<longcatargvalue>val1</longcatargvalue>
</longcattoolcall>
Some text in between.
<longcattoolcall>tool_two
<longcatargkey>key2</longcatargkey>
<longcatargvalue>val2</longcatargvalue>
</longcattoolcall>
`;

    const result = parseLongcatToolCalls(content);
    expect(result).toHaveLength(2);
    
    expect(result[0].function.name).toBe('tool_one');
    expect(JSON.parse(result[0].function.arguments)).toEqual({ key1: 'val1' });
    
    expect(result[1].function.name).toBe('tool_two');
    expect(JSON.parse(result[1].function.arguments)).toEqual({ key2: 'val2' });
  });

  it('rejects a malformed tagged call instead of executing it with empty arguments', () => {
    const content = `
<longcattoolcall>tool_one
<longcatargkey>key1</longcatargkey>
<!-- missing value tag -->
</longcattoolcall>
`;
    const result = parseLongcatToolCalls(content);
    expect(result).toBeNull();
  });

  it('preserves native tool calls and fills an empty native tool-call array', () => {
    const native = [{ id: 'native', function: { name: 'native_tool', arguments: '{}' } }];
    const content = [
      '<longcattoolcall>fallback_tool',
      '<longcatargkey>query</longcatargkey>',
      '<longcatargvalue>hello</longcatargvalue>',
      '</longcattoolcall>',
    ].join('\n');

    expect(withLongcatToolCallFallback({ content, tool_calls: native }).tool_calls).toBe(native);
    expect(withLongcatToolCallFallback({ content, tool_calls: [] }).tool_calls[0].function.name)
      .toBe('fallback_tool');
  });
});
