export function humanizeFinding(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').replace(/^[-–—•]+\s*/, '').trim();
  const separator = normalized.indexOf(': ');
  const unprefixed = separator >= 0 && (
    normalized.slice(0, separator).length >= 28
    || /product title|imagery|availability|price|should|every page|risk/i.test(normalized.slice(0, separator))
  ) ? normalized.slice(separator + 2).trim() : normalized;

  const discount = unprefixed.match(/sale evidence includes.*?[“"]([^”"]*%\s*off)[”"]/i);
  if (discount) return `A ${discount[1]} discount is clearly promoted, making the offer easy for shoppers to understand.`;
  const support = unprefixed.match(/(\d+) of \1 support signals were detected:\s*(.+)\.?$/i);
  if (support) return `${support[2]} are all easy to find, giving shoppers stronger reassurance.`;
  if (/breadcrumb navigation is present/i.test(unprefixed)) return 'Breadcrumb navigation helps shoppers understand where they are and move around the store.';
  const images = unprefixed.match(/(\d+) images were detected, supporting a product gallery/i);
  if (images) return `A ${images[1]}-image product gallery gives shoppers a detailed view of the product.`;
  if (/^0 vague link label/i.test(unprefixed) || /^link labels clearly describe/i.test(unprefixed)) {
    return 'Clear link labels make navigation easier to understand and more accessible.';
  }
  const productTitle = unprefixed.match(/detected product title is [“"](.+?)[”"]/i);
  if (productTitle) return `The product is clearly identified as “${productTitle[1]}”.`;

  if (separator < 0 || unprefixed !== normalized) return unprefixed.replace(/\.{2,}/g, '.');
  const heading = normalized.slice(0, separator);
  const evidence = normalized.slice(separator + 2).trim();
  if (heading.length >= 32 || /should|available|shown|contains|includes|every page|risk/i.test(heading)) {
    return evidence ? `${evidence.charAt(0).toUpperCase()}${evidence.slice(1)}` : heading;
  }
  return normalized;
}
