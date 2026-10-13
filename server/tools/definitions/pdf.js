// YorWare PDF agent tools (spec 13): read a PDF on the shared canvas, fill
// its form, and flag where a person should sign. Agents never sign.
export const pdfTools = [
  {
    type: 'function',
    function: {
      name: 'read_pdf',
      description: 'Read a PDF window on the shared canvas: the words on each page (in the board\'s page order), its fill-in form fields with their current answers, sign-here flags and signatures already placed. Find PDF windows with canvas_window_index; their kind is yorPdf.',
      parameters: {
        type: 'object',
        properties: {
          window_id: { type: 'string', description: 'Exact id of the yorPdf window (from canvas_window_index)' },
          from_page: { type: 'number', description: 'First page to read, starting at 1 (default 1)' },
          to_page: { type: 'number', description: 'Last page to read (default the last page)' },
        },
        required: ['window_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fill_pdf_field',
      description: 'Fill one of the PDF\'s own form fields (text box, tick box, pick-one list or round choice) on the shared canvas. Use the exact field name from read_pdf. Everyone on the board sees the answer at once and it prints into the exported PDF. Signature boxes cannot be filled: use sign_here.',
      parameters: {
        type: 'object',
        properties: {
          window_id: { type: 'string', description: 'Exact id of the yorPdf window' },
          field: { type: 'string', description: 'The field name exactly as read_pdf lists it' },
          value: { type: ['string', 'boolean'], description: 'The answer: text, the option name for a list or round choice, or true/false for a tick box' },
        },
        required: ['window_id', 'field', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sign_here',
      description: 'Put an amber "Sign here" flag on a PDF on the shared canvas, so a person signs there with one click. It never signs for anyone and never prints in the exported PDF. Place it next to printed words (near_text, e.g. "Tenant signature"), on a signature field (field), or at the bottom of a page (page alone). With nothing given it uses the first signature box in the form.',
      parameters: {
        type: 'object',
        properties: {
          window_id: { type: 'string', description: 'Exact id of the yorPdf window' },
          page: { type: 'number', description: 'Page number, starting at 1 (limits near_text and field to that page)' },
          near_text: { type: 'string', description: 'Words printed next to the signature line; the flag goes just after them' },
          field: { type: 'string', description: 'A form field name from read_pdf to cover with the flag' },
          signer: { type: 'string', description: 'Who should sign, e.g. "Tenant" or "Sam"' },
          note: { type: 'string', description: 'A short note shown on the flag' },
        },
        required: ['window_id'],
      },
    },
  },
];
