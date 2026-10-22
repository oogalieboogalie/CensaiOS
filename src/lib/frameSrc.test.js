import { webOnlyFrameSrc } from './frameSrc.js';

describe('webOnlyFrameSrc', () => {
  it('lets plain web addresses through unchanged', () => {
    expect(webOnlyFrameSrc('https://www.youtube.com/embed/abc?autoplay=1')).toBe('https://www.youtube.com/embed/abc?autoplay=1');
    expect(webOnlyFrameSrc('http://localhost:8000/radio.mp3')).toBe('http://localhost:8000/radio.mp3');
  });

  it('loads nothing for script, data and other links', () => {
    expect(webOnlyFrameSrc('javascript:parent.x=1')).toBe('');
    expect(webOnlyFrameSrc('  JavaScript:alert(1)')).toBe('');
    expect(webOnlyFrameSrc('data:text/html,<script>1</script>')).toBe('');
    expect(webOnlyFrameSrc('spotify:track:1')).toBe('');
    expect(webOnlyFrameSrc('https://')).toBe('');
    expect(webOnlyFrameSrc(undefined)).toBe('');
  });
});
