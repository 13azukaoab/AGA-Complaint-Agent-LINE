// flex.js — สร้าง Flex การ์ดสรุปงาน (weekly/monthly) จากข้อมูลที่คำนวณแล้ว
// ใช้ร่วมกัน 2 ที่: index.js (command #สรุปสัปดาห์/#สรุปเดือน) + notify.js (scheduled push)
//
// Logic การทำงาน:
//   - รับ object สถิติที่ summary.js คำนวณมาแล้ว → คืน Flex "bubble" contents
//   - weekly = header น้ำเงิน + แถบ progress อัตราปิด
//   - monthly = header แดง + 2 ช่องเทียบเดือนก่อน (อัตราปิด ▲▼ + งานเข้า ▲▼)

const TERMITE_ICON = 'https://storage.googleapis.com/aga-complaint-photos/icons/termite.png';

// map ชนิดสัตว์ → icon (ปลวก = รูปจริง, ที่เหลือ emoji)
const PEST_ICON = {
  'หนู': '🐀', 'ปลวก': TERMITE_ICON, 'แมลงสาบ': '🪳', 'ยุง': '🦟', 'มด': '🐜', 'อื่นๆ': '▫️',
};

// ── helper components ────────────────────────────────────────────
function kpiTile(n, l, color) {
  return {
    type: 'box', layout: 'vertical', flex: 1, backgroundColor: '#F6F8FB', cornerRadius: '10px', paddingAll: '8px',
    contents: [
      { type: 'text', text: String(n), size: 'xxl', weight: 'bold', color, align: 'center' },
      { type: 'text', text: l, size: 'xxs', color: '#6B7280', align: 'center', margin: 'xs' },
    ],
  };
}

function cmpTile(l, v, color) {
  return {
    type: 'box', layout: 'vertical', flex: 1, backgroundColor: '#F6F8FB', cornerRadius: '8px', paddingAll: '8px',
    contents: [
      { type: 'text', text: l, size: 'xxs', color: '#6B7280' },
      { type: 'text', text: v, size: 'sm', weight: 'bold', color },
    ],
  };
}

// แถบ progress แนวนอน (เช่น อัตราปิด)
function progressBar(pct, color) {
  return {
    type: 'box', layout: 'horizontal', height: '10px', backgroundColor: '#E9EDF2', cornerRadius: '6px', margin: 'sm',
    contents: [{ type: 'box', layout: 'vertical', width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color, cornerRadius: '6px', contents: [{ type: 'filler' }] }],
  };
}

// แถวชนิดสัตว์: icon + ชื่อ + แถบ + จำนวน
function pestRow(name, count, maxCount) {
  const icon = PEST_ICON[name] || '▫️';
  const isUrl = typeof icon === 'string' && icon.startsWith('http');
  const w = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  return {
    type: 'box', layout: 'horizontal', margin: 'md', spacing: 'sm', alignItems: 'center',
    contents: [
      isUrl
        ? { type: 'box', layout: 'vertical', width: '22px', height: '22px', flex: 0, contents: [{ type: 'image', url: icon, size: 'full', aspectMode: 'fit' }] }
        : { type: 'text', text: icon, flex: 0, size: 'sm' },
      { type: 'text', text: name, flex: 3, size: 'sm', color: '#1F2937' },
      { type: 'box', layout: 'horizontal', flex: 5, height: '8px', backgroundColor: '#E9EDF2', cornerRadius: '4px',
        contents: [{ type: 'box', layout: 'vertical', width: `${Math.max(6, w)}%`, backgroundColor: '#2563EB', cornerRadius: '4px', contents: [{ type: 'filler' }] }] },
      { type: 'text', text: String(count), flex: 0, size: 'sm', weight: 'bold', align: 'end', color: '#1F2937' },
    ],
  };
}

// แถวอาคาร: อันดับ + ชื่อ + จำนวน
function bldgRow(rank, name, count) {
  return {
    type: 'box', layout: 'horizontal', margin: 'sm', spacing: 'sm', alignItems: 'center',
    contents: [
      { type: 'text', text: `${rank}.`, flex: 0, size: 'sm', weight: 'bold', color: '#2563EB' },
      { type: 'text', text: name, flex: 1, size: 'sm', color: '#1F2937', wrap: true },
      { type: 'text', text: String(count), flex: 0, size: 'sm', weight: 'bold', color: '#1F2937', align: 'end' },
    ],
  };
}

const sep = () => ({ type: 'separator', margin: 'lg', color: '#ECEFF3' });

// สร้างส่วน body ที่ใช้ร่วมกัน (ชนิดสัตว์ + อาคาร + หนูจับได้)
function commonBody(pests, buildings, topN, ratCatch) {
  const maxPest = Math.max(1, ...pests.map(p => p.count));
  const shownPests = pests.filter(p => p.count > 0);
  return [
    sep(),
    { type: 'text', text: '🐾 แยกชนิดสัตว์รบกวน', weight: 'bold', size: 'sm', margin: 'lg' },
    ...(shownPests.length ? shownPests.map(p => pestRow(p.name, p.count, maxPest))
      : [{ type: 'text', text: 'ไม่มีข้อมูล', size: 'xs', color: '#9CA3AF', margin: 'sm' }]),
    sep(),
    { type: 'text', text: `🏢 อาคาร TOP ${topN} (เคสแจ้ง)`, weight: 'bold', size: 'sm', margin: 'lg' },
    ...(buildings.length ? buildings.slice(0, topN).map((b, i) => bldgRow(i + 1, b.name, b.count))
      : [{ type: 'text', text: 'ไม่มีข้อมูล', size: 'xs', color: '#9CA3AF', margin: 'sm' }]),
    { type: 'box', layout: 'horizontal', backgroundColor: '#F6F8FB', cornerRadius: '10px', paddingAll: '10px', margin: 'lg', alignItems: 'center',
      contents: [
        { type: 'text', text: '🐀 หนูที่จับได้รวม', size: 'sm', weight: 'bold', color: '#374151', flex: 1 },
        { type: 'text', text: `${ratCatch} ตัว`, size: 'md', weight: 'bold', color: '#D97706', align: 'end', flex: 0 },
      ] },
  ];
}

function footer(openCount, openWOsLine) {
  return {
    type: 'box', layout: 'vertical', backgroundColor: '#FFF7ED', paddingAll: '12px',
    contents: [
      { type: 'text', text: `🟡 คงค้าง ${openCount} งาน`, weight: 'bold', size: 'sm', color: '#D97706' },
      { type: 'text', text: openWOsLine || 'พิมพ์ "งานค้าง" ดูรายละเอียด', size: 'xs', color: '#92400E', wrap: true, margin: 'xs' },
    ],
  };
}

// ── การ์ดรายสัปดาห์ (header น้ำเงิน + progress อัตราปิด) ──────────
// d = { rangeLabel, total, closed, open, closeRate, pests, buildings, ratCatch, openWOsLine }
function buildWeeklyFlex(d) {
  return {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#1E40AF', paddingAll: '16px',
      contents: [
        { type: 'text', text: '📊 สรุปงานรายสัปดาห์', color: '#FFFFFF', weight: 'bold', size: 'lg' },
        { type: 'text', text: `${d.rangeLabel} · ไม่รวมงานแจ้งซ้ำ`, color: '#DBEAFE', size: 'xs', margin: 'sm', wrap: true },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '16px',
      contents: [
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [kpiTile(d.total, 'งานทั้งหมด', '#2563EB'), kpiTile(d.closed, 'ปิดแล้ว', '#059669'), kpiTile(d.open, 'ค้าง', '#D97706')] },
        { type: 'box', layout: 'vertical', margin: 'lg', contents: [
          { type: 'box', layout: 'horizontal', contents: [
            { type: 'text', text: 'อัตราปิดงาน', size: 'sm', weight: 'bold', color: '#374151' },
            { type: 'text', text: `${d.closeRate}%`, size: 'sm', weight: 'bold', color: '#059669', align: 'end' },
          ] },
          progressBar(d.closeRate, '#059669'),
        ] },
        ...commonBody(d.pests, d.buildings, 3, d.ratCatch),
      ],
    },
    footer: footer(d.open, d.openWOsLine),
  };
}

// ── การ์ดรายเดือน (header แดง + เทียบเดือนก่อน) ──────────────────
// d = { monthLabel, total, closed, open, closeRate, closeRateDeltaStr, cmpStr, pests, buildings, ratCatch, openWOsLine }
function buildMonthlyFlex(d) {
  return {
    type: 'bubble', size: 'mega',
    header: {
      type: 'box', layout: 'vertical', backgroundColor: '#B91C1C', paddingAll: '16px',
      contents: [
        { type: 'text', text: '📅 สรุปงานรายเดือน', color: '#FFFFFF', weight: 'bold', size: 'lg' },
        { type: 'text', text: `${d.monthLabel} · ไม่รวมงานแจ้งซ้ำ`, color: '#FEE2E2', size: 'xs', margin: 'sm', wrap: true },
      ],
    },
    body: {
      type: 'box', layout: 'vertical', paddingAll: '16px',
      contents: [
        { type: 'box', layout: 'horizontal', spacing: 'sm', contents: [kpiTile(d.total, 'งานทั้งหมด', '#2563EB'), kpiTile(d.closed, 'ปิดแล้ว', '#059669'), kpiTile(d.open, 'ค้าง', '#D97706')] },
        { type: 'box', layout: 'horizontal', spacing: 'sm', margin: 'md', contents: [
          cmpTile('อัตราปิดงาน', `${d.closeRate}% ${d.closeRateDeltaStr || ''}`.trim(), '#059669'),
          cmpTile('เทียบเดือนก่อน', d.cmpStr || '—', '#2563EB'),
        ] },
        ...commonBody(d.pests, d.buildings, 5, d.ratCatch),
      ],
    },
    footer: footer(d.open, d.openWOsLine),
  };
}

module.exports = { buildWeeklyFlex, buildMonthlyFlex, PEST_ICON };
