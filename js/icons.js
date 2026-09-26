// 24×24 の線アイコン（固定文字列）

const wrap = (body, width = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  home: wrap('<path d="M4 11l8-7 8 7v8.5a.5.5 0 0 1-.5.5H15v-6H9v6H4.5a.5.5 0 0 1-.5-.5z"/>'),
  library: wrap('<rect x="4" y="4" width="4" height="16" rx="2"/><rect x="10" y="4" width="4" height="16" rx="2"/><rect x="16" y="4" width="4" height="16" rx="2"/>'),
  chart: wrap('<path d="M6 20V13"/><path d="M12 20V5"/><path d="M18 20v-9"/>'),
  settings: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 1.8),
  plusCircle: wrap('<circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/>'),
  plus: wrap('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  caret: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9h12l-6 7z" fill="currentColor"/></svg>',
  close: wrap('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  chevron: wrap('<path d="M9 5l7 7-7 7"/>'),
  undo: wrap('<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  speaker: wrap('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  speakerOff: wrap('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5"/><path d="M21 9.5l-5 5"/>'),
  check: wrap('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  x: wrap('<path d="M7 7l10 10"/><path d="M17 7L7 17"/>'),
  checkCircle: wrap('<circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.3l3 3 6-6.3"/>', 1.8),
  xCircle: wrap('<circle cx="12" cy="12" r="9.5"/><path d="M8.5 8.5l7 7"/><path d="M15.5 8.5l-7 7"/>', 1.8),
  tildeCircle: wrap('<circle cx="12" cy="12" r="9.5"/><path d="M7 13c1.5-2.5 3.5-2.5 5 0s3.5 2.5 5 0"/>', 1.8),
  arrowRight: wrap('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'),
  arrowLeft: wrap('<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>'),
  arrowDown: wrap('<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>'),
  upload: wrap('<path d="M12 15V4"/><path d="M7 9l5-5 5 5"/><path d="M5 15v4h14v-4"/>'),
  download: wrap('<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 19h14"/>'),
  search: wrap('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>'),
  trash: wrap('<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>'),
  edit: wrap('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  copy: wrap('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  repeat: wrap('<path d="M17 2l3 3-3 3"/><path d="M20 5H9a5 5 0 0 0-5 5v1"/><path d="M7 22l-3-3 3-3"/><path d="M4 19h11a5 5 0 0 0 5-5v-1"/>'),
  seal: wrap('<path d="M5 12.5l4.5 4.5L19 7"/>', 3),
};
