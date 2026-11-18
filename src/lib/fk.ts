/**
 * fk 标记语言解析器 · 1:1 移植自 lib/fk.class.php
 * 原版核心排版能力，保持输出 HTML 结构一致
 */

const escapeHtml = (s: string): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

interface CatalogItem {
  content: string;
  level: number;
  type: number;
  child?: CatalogItem[];
}

function hasCol(list: number[] | null, k: number): boolean {
  return !!list && list.indexOf(k) > -1;
}

export class Fk {
  private arr: (string | false)[] = [];
  private table: string[][] = [];
  private tables = 0;
  private tableThead = false;
  private list: CatalogItem[] = [];
  private code = false;
  private color = ['R', 'O', 'Y', 'G', 'C', 'B', 'P', 'D'];
  public title = '';
  public version = '';
  public html = '';
  public htmls: string | false = false;
  public td: string[] = [];
  public var: Record<string, string> = {};
  public col = '';
  public tdNum = 0;
  public badgeCount = 0;

  public mark: Record<string, string> = {
    i: 'fk-italic', b: 'fk-bold',
    s: 'fk-del', u: 'fk-underline',
    R: 'fk-color-R', O: 'fk-color-O',
    Y: 'fk-color-Y', G: 'fk-color-G',
    C: 'fk-color-C', B: 'fk-color-B',
    P: 'fk-color-P',
    LR: 'fk-tag fk-tag-LR', LO: 'fk-tag fk-tag-LO', LY: 'fk-tag fk-tag-LY', LG: 'fk-tag fk-tag-LG', LC: 'fk-tag fk-tag-LC', LB: 'fk-tag fk-tag-LB', LP: 'fk-tag fk-tag-LP', LD: 'fk-tag fk-tag-LD',
    DR: 'fk-tag fk-tag-DR', DO: 'fk-tag fk-tag-DO', DY: 'fk-tag fk-tag-DY', DG: 'fk-tag fk-tag-DG', DC: 'fk-tag fk-tag-DC', DB: 'fk-tag fk-tag-DB', DP: 'fk-tag fk-tag-DP', DD: 'fk-tag fk-tag-DD',
    t: 'fk-title',
    ts: 'fk-title-s',
    tu: 'fk-title-u',
    tl: 'fk-title-l',
    tc: 'fk-title-c',
    tr: 'fk-title-r',
    '@': 'fk-mail',
    '/': 'fk-italic',
    '%': 'fk-bold',
    _: 'fk-underline',
    '>': 'fk-blockquote',
    '>R': 'fk-blockquote fk-blockquote-R',
    '>O': 'fk-blockquote fk-blockquote-O',
    '>Y': 'fk-blockquote fk-blockquote-Y',
    '>G': 'fk-blockquote fk-blockquote-G',
    '>C': 'fk-blockquote fk-blockquote-C',
    '>B': 'fk-blockquote fk-blockquote-B',
    '>P': 'fk-blockquote fk-blockquote-P',
    '#': 'fk-h2',
    '#1': 'fk-h1',
    '#1-': 'fk-h1 fk-u',
    '#2': 'fk-h2',
    '#2-': 'fk-h2 fk-u',
    '#3': 'fk-h3',
    '#3-': 'fk-h3 fk-u',
    '#4': 'fk-h4',
    '#4-': 'fk-h4 fk-u',
    '#5': 'fk-h5',
    '#5-': 'fk-h5 fk-u',
    '#6': 'fk-h6',
    '#6-': 'fk-h6 fk-u',
    sup: 'fk-sup',
    sub: 'fk-sub',
    left: 'fk-left',
    center: 'fk-center',
    right: 'fk-right',
  };

  constructor(fk = '') {
    this.render(fk + '\n');
  }

  /** 目录（文档用） */
  public catalog(fk: string): { catalog: string; title?: string; version?: string } {
    const lines = String(fk).split('\n');
    const arr: any = { catalog: '' };
    let isTitle = false;
    for (const v of lines) {
      const vs = v.trim();
      if (!vs) continue;
      if (!isTitle) {
        isTitle = true;
        const m = /(.*?)\s*(v\d+(\.\d+)*)*$/i.exec(vs);
        if (m) {
          arr.title = m[1];
          arr.version = m[2] || '';
        }
        continue;
      }
      if (vs.slice(0, 3) === '---') continue;
      this.catalogReg(v);
    }
    arr.catalog = this.htmlCatalog(this.list);
    return arr;
  }

  private catalogReg(str: string): void {
    if (!str.trim().length) return;
    const m = /^([\s]+).+?/.exec(str);
    let tab = m && m[1] ? m[1].length : 0;
    if (tab) tab = Math.floor(tab / 2);
    this.list = this.addChild(this.list, { content: str.trim(), level: tab, type: 1 }, tab);
  }

  private htmlCatalog(arr: CatalogItem[]): string {
    let html = '<ul>';
    for (const v of arr) {
      html += '<li>';
      html += `<a href="javascript:;">${v.content}</a>`;
      if (v.child) html += this.htmlChild(v.child);
      html += '</li>';
    }
    html += '</ul>';
    return html;
  }

  private str2arr(str: string): string[] {
    return Array.from(str);
  }

  private getWidth(str: string): number {
    const w: [string, number][] = [
      ['mw', 11],
      ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 8],
      ['abdeghnopqeuvxy0123456789', 7],
      ['crstz.', 5],
      ['fijl', 3],
    ];
    const arr = this.str2arr(str);
    let width = 0;
    for (const value of arr) {
      const before = width;
      for (const [k, v] of w) {
        if (k.includes(value)) {
          width += v;
          break;
        } else if (value === ' ') {
          width += 3;
          break;
        } else if (/^[\u4e00-\u9fa5]+$/.test(value)) {
          width += 12;
          break;
        }
      }
      if (before === width) width += 10;
    }
    return width;
  }

  /** 徽章 title|content color */
  private badge(content: string, color = 'default'): string {
    if (!content) return '';
    const p1 = content.trim().split('|');
    const key = p1[0];
    const keyLen = this.getWidth(key);
    const keyWidth = keyLen + 10;
    let width = keyWidth;
    const id = this.badgeCount++;
    const value = p1.length > 1 ? p1[1] : p1[0];
    let valueLen = 0;
    let valueX = 0;
    let valueBG = 0;
    if (p1.length > 1) {
      valueLen = this.getWidth(value);
      const valueWidth = valueLen + 10;
      valueX = keyWidth + 5;
      width = keyWidth + valueWidth;
      valueBG = width - keyWidth;
    }
    const colorList: Record<string, string> = {
      red: '#f1716c', orange: '#f57e00', yellow: '#fac413', green: '#26bc5c', cyan: '#8cd03d',
      blue: '#768fe7', purple: '#9e83e1', gray: '#b2b2b2', black: '#555', default: '#f1716c',
    };
    let c = (color || '').trim();
    c = !c ? 'default' : c;
    const fill = colorList[c] || `#${c}`;
    let rect: string;
    let text: string;
    if (p1.length > 1) {
      rect = `<rect width="${keyWidth}" height="20" fill="#555"/><rect x="${keyWidth}" width="${valueBG}" height="20" fill="${fill}"/><rect width="${width}" height="20" fill="url(#l${id})"/>`;
      text = `<text x="${valueX}" y="14" fill="#fff" textLength="${valueLen}">${value}</text>`;
    } else {
      rect = `<rect width="${keyWidth}" height="20" fill="${fill}"/><rect width="${width}" height="20" fill="url(#l${id})"/>`;
      text = '';
    }
    const svg = `
		<svg width="${width}" height="20" role="img" aria-label="${key}: ${value}">
			<title>${key}: ${value}</title>
			<linearGradient id="l${id}" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
			<clipPath id="c${id}"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
			<g clip-path="url(#c${id})">${rect}</g>
			<g fill="#fff" text-anchor="start" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11"><text x="5" y="14" fill="#fff" textLength="${keyLen}">${key}</text>${text}</g>
		</svg>`;
    return svg.replace(/[\r\n]+/g, '');
  }

  /** 主流程 */
  private render(input: string): void {
    let fk = String(input ?? '');
    fk = fk.replace(/(?<!\\)\[![\s\S]*?\](?<!\\)/g, '');
    fk = fk.replace(/\r/g, '');
    const lines = fk.split('\n');
    let html = '<div class="fk">';
    for (const line of lines) this.fkReg(line);
    let isTitle = false;
    for (let h of this.arr) {
      if (!h && !isTitle) continue;
      if (h && !isTitle) {
        isTitle = true;
        const match = /^《([\s\S]+)》$/i.exec(h);
        if (match && match[1]) {
          const t = /(.*?)\s*(v\d+(\.\d+)*)*$/i.exec(match[1].trim());
          if (t) {
            this.title = t[1];
            this.version = t[2] || '';
            h = `<p class="fk-title">${this.title}<span class="fk-version">${this.version}</span></p>`;
          }
        }
      }
      html += h ? h + '\n' : '\n';
    }
    html += '</div>';
    // 多行代码
    html = html.replace(/``(\w+)([\s\S]*?)``/g, (_m, lang: string, code: string) => `<pre class="code-${lang}">${escapeHtml(this.codeInit(code))}</pre>`);
    // 转义符
    html = html.replace(/\\([^\s]?)/g, '$1');
    // 表格竖线
    html = html.replace(/__@vline__/g, '|');
    this.html = html;
  }

  private codeInit(code: string): string {
    let c = code.replace(/\t/g, '    ');
    const lines = c.split('\n');
    if (lines.length > 0) {
      let first = '';
      for (const v of lines) {
        if (v.trim().length) {
          first = v;
          break;
        }
      }
      if (first.length) {
        const m = /^\s+/.exec(first);
        if (m && m[0]) {
          const n = m[0].length;
          for (let i = 0; i < lines.length; i++) lines[i] = lines[i].replace(new RegExp(`^\\s{0,${n}}`), '');
        }
      }
    }
    return lines.join('\n');
  }

  private addChild(list: CatalogItem[], item: CatalogItem, tab = 0): CatalogItem[] {
    const s = list.length - 1;
    if (!tab) {
      list.push(item);
      return list;
    }
    if (s >= 0 && list[s].child && list[s].child!.length) {
      list[s].child = this.addChild(list[s].child!, item, tab - 1);
    } else if (s < 0) {
      list.push(item);
    } else {
      list[s].child = [item];
    }
    return list;
  }

  private htmlChild(arr: CatalogItem[]): string {
    const type = arr[0]?.type === 2 ? 'ol' : 'ul';
    let html = `<${type}>`;
    for (const v of arr) {
      let li = '<li>';
      let str = v.content;
      const a = str.slice(0, 1);
      if (this.color.includes(a)) {
        li = `<li class="fk-color-${a}">`;
        str = str.slice(1);
      }
      html += li + str;
      if (v.child) html += this.htmlChild(v.child);
      html += '</li>';
    }
    html += `</${type}>`;
    return html;
  }

  /** 根据标记获取样式 */
  public getStyle(t: string): string {
    const arr = String(t || '').split('.');
    const classes: string[] = [];
    let style = '';
    for (const v of arr) {
      if (this.mark[v] !== undefined) {
        classes.push(this.mark[v]);
      } else {
        const a = v.slice(0, 1);
        if (a === '~') style += `font-size:${v.slice(1)}px;`;
        else if (a === '#') style += `color:${v};`;
      }
    }
    const cls = classes.join(' ');
    return (cls ? ` class="${cls}"` : '') + (style ? ` style="${style}"` : '');
  }

  private tableHtml(): void {
    if (!this.table.length) return;
    let html = '<table>';
    let right: number[] | null = null;
    let center: number[] | null = null;
    const widths: { cols: number; width: string }[] = [];
    if (this.tableThead) {
      html += '<thead><tr>';
      const head = this.table[0];
      head.forEach((raw, k) => {
        let str = raw.trim();
        let w = '';
        const m = /^([\d]+[\w%]*)(\s+|-)/.exec(str);
        if (m) {
          w = m[1];
          widths.push({ cols: k, width: w });
          str = str.replace(/^\d+[\w%]*\s*/s, '');
        }
        const wAttr = w ? ` style="width:${/^\d+$/.test(w) ? w + 'px' : w}"` : '';
        if (str.slice(0, 1) === '-' && str.slice(-1) === '-') {
          if (center) center.push(k); else center = [k];
          html += `<th class="fk-table-center"${wAttr}>${str.slice(1, -1)}</th>`;
        } else if (str.slice(-1) === '-') {
          if (right) right.push(k); else right = [k];
          html += `<th class="fk-table-right"${wAttr}>${str.slice(0, -1)}</th>`;
        } else if (str.slice(0, 1) === '-') {
          html += `<th class="fk-table-left"${wAttr}>${str.slice(1)}</th>`;
        } else {
          html += `<th class="fk-table-left"${wAttr}>${str}</th>`;
        }
      });
      html += '</tr></thead>';
      this.table.shift();
      this.tableThead = false;
    }
    html += '<tbody>';
    for (const row of this.table) {
      html += '<tr>';
      row.forEach((rawValue, k) => {
        let value = rawValue;
        let color = '';
        const cm = /^(\s*\[(#\w{3,6})\.?(#\w{3,6})?\])/.exec(value);
        if (cm) {
          color = ` style="background:${cm[3] ? `${cm[2]};color:${cm[3]}"` : `${cm[2]}"`}`;
          value = value.replace(cm[1], '');
        }
        const codes: string[] = [];
        value = value.replace(/``\w+[\s\S]*?``/g, (m0) => {
          codes.push(m0);
          return `__@vcode${codes.length - 1}__`;
        });
        const valueArr = value.split('\n');
        if (valueArr.length > 1) {
          valueArr.splice(valueArr.length - 1, 1);
          value = valueArr.join('</p><p>');
        }
        value = value.replace(/__@vcode(\d+)__/g, (_m, i: string) => codes[Number(i)]);
        let align = 'fk-table-left';
        if (hasCol(center, k)) align = 'fk-table-center';
        if (hasCol(right, k)) align = 'fk-table-right';
        html += `<td class="${align}"${color}><p>${value}</p></td>`;
      });
      html += '</tr>';
    }
    html += '</tbody></table>';
    this.table = [];
    this.arr.push(html);
  }

  /** 单行解析 */
  private fkReg(str: string): void {
    if (str === '[html') {
      this.htmls = '';
      return;
    }
    if (this.htmls !== false) {
      if (str === ']') {
        this.arr.push(this.htmls);
        this.htmls = false;
      } else {
        this.htmls += str + '\n';
      }
      return;
    }
    // 变量
    str = str.replace(/(?<!\\)\[\.([^\]]+?)\](?<!\\)/g, (m0: string, name: string) => {
      return this.var[name] !== undefined ? this.var[name] : m0;
    });
    // 列表分级
    const mm = /^([\s]+).+?/.exec(str);
    let tab = mm && mm[1] ? mm[1].length : 0;
    if (tab) tab = Math.floor(tab / 2);
    let p = false;
    let text = str.trim();
    if (!text) {
      if (this.list.length) {
        this.arr.push(this.htmlChild(this.list));
        this.list = [];
      }
      this.tableHtml();
      this.arr.push(false);
      return;
    }
    const a1 = text.slice(0, 1);
    const a2 = text.slice(0, 2);
    const a3 = text.slice(0, 3);
    const b1 = text.slice(1).trim();
    let b2 = text.slice(2).trim();
    let c = text.slice(1, 2);

    if (a1 === '[') {
      // [$变量] 赋值
      const vm = /^\[\$([^\]]+)\]/.exec(str);
      if (vm) {
        const name = vm[1].trim();
        this.var[name] = str.slice(vm[1].length + 3).trim();
        return;
      }
      // [标记 内容]
      const sm = /^\[([^\]]+)\s+([^\]]+)\](.*)/.exec(text);
      if (sm) {
        const style = this.getStyle(sm[1]);
        if (style) text = `<span${style}>${sm[2]}</span>${sm[3]}`;
      } else {
        const sm2 = /^\[(.*?)\]/.exec(text);
        if (sm2) {
          const style = this.getStyle(sm2[1]);
          if (style) {
            text = text.slice(sm2[1].length + 2).trim();
            text = `<p${style}>${text}</p>`;
          }
        }
      }
    }
    // 列表
    if (a2 !== '- ' && a2 !== '* ') {
      if (this.list.length) {
        this.arr.push(this.htmlChild(this.list));
        this.list = [];
      }
    }
    // 代码段（表格内）
    if (this.tables) {
      if (this.code) {
        if (a2 === '``') {
          this.code = false;
          const cols = this.col.split('\n');
          cols.pop();
          this.col = cols.join('\n');
          this.col += str + '\n';
          return;
        }
        this.col += str + '\n';
        return;
      }
      if (a2 === '``') {
        this.code = true;
        text = text.replace(/[`\s]+/g, '``').replace(/(\w+)`+/g, '$1');
        this.col += text + '\n';
        return;
      }
    } else {
      if (this.code) {
        if (a2 === '``') {
          this.code = false;
          this.arr.push(a2);
          return;
        }
        this.arr.push(str);
        return;
      }
      if (a2 === '``') {
        this.code = true;
        text = text.replace(/[`\s]+/g, '``').replace(/(\w+)`+/g, '$1');
        this.arr.push(text);
        return;
      }
    }
    if (text === '[table') {
      this.tables = 1;
      this.td = [];
      this.col = '';
      return;
    }
    // 块级元素
    if (a1 === '>') {
      c = b1.slice(0, 1);
      const rest = b1.slice(1);
      if (this.color.includes(c)) text = `<blockquote class="fk-blockquote-${c}">${rest}</blockquote>`;
      else text = `<blockquote>${b1}</blockquote>`;
    } else {
      const cm = /^(#\w{3,})\s+([\s\S]+)/.exec(text);
      if (cm) {
        text = `<p style="color:${cm[1]}">${cm[2]}</p>`;
      } else {
        const u = text.slice(2, 3) === '-' ? ' class="fk-u"' : '';
        b2 = text.slice(2, 3) === '-' ? text.slice(3) : b2;
        if (a2 === '#1') text = `<h1${u}>${b2}</h1>`;
        else if (a2 === '#2') text = `<h2${u}>${b2}</h2>`;
        else if (a2 === '#3') text = `<h3${u}>${b2}</h3>`;
        else if (a2 === '#4') text = `<h4${u}>${b2}</h4>`;
        else if (a2 === '#5') text = `<h5${u}>${b2}</h5>`;
        else if (a2 === '#6') text = `<h6${u}>${b2}</h6>`;
        else if (a2 === '# ') text = `<h2 class="fk-u">${b2}</h2>`;
        else if (a2 === '==') {
          this.arr.push('<hr/>');
          return;
        } else p = true;
      }
    }
    // 行内元素
    text = text.replace(/(?<!\\)`(.+?)(?<!\\)`/g, (_m, code: string) => {
      let v = code.trim();
      v = v.replace(/\[/g, '__@left__').replace(/\]/g, '__@right__');
      return v ? `<code>${escapeHtml(v)}</code>` : '';
    });
    text = text.replace(/(?<!\\)\[(.+?)\s+(.+?)(?<!\\)\]/g, (m0: string, styleKey: string, content: string) => {
      const style = this.getStyle(styleKey);
      return style ? `<span${style}>${content}</span>` : m0;
    });
    text = text.replace(/(?<!\\)\[(#.+?)\s+(.+?)\](?<!\\)/gi, '<span style="color:$1">$2</span>');
    text = text.replace(/(?<!\\)\[~(\d+)\s+(.+?)\](?<!\\)/gi, '<span style="font-size:$1px">$2</span>');
    text = text.replace(/(?<!\\)\[icon\s+([^\s\]]+)\s*([^\s\]]*)\](?<!\\)\((.+?)\)/gi, (_m, key: string, color: string, url: string) => {
      return `<a href="${url}" target="_blank">${this.badge(key, color)}</a>`;
    });
    text = text.replace(/(?<!\\)\[icon\s+([^\s\]]+)\s*([^\s\]]*)\](?<!\\)/gi, (_m, key: string, color: string) => this.badge(key, color));
    text = text.replace(/(?<!\\)\[@\s+(.+?)\](?<!\\)/gi, '<a href="mailto:$1">$1</a>');
    text = text.replace(/(?<!\\)\[img\s+([^\s\]]*)\s*([^\s\]]*)\s*([^\s\]]*)\](?<!\\)\(([\s\S]+?)\)/gi, '<a href="$4" target="_blank"><img src="$1" alt="$2" title="$3"/></a>');
    text = text.replace(/(?<!\\)\[img\s+([^\s\]]*)\s*([^\s\]]*)\s*([^\s\]]*)\s*([^\s\]]*)\s*([^\s\]]*)\](?<!\\)/gi, '<img src="$1" alt="$2" title="$3" width="$4" height="$5"/>');
    text = text.replace(/(?<!\\)\[file\s+([^\s\]]*)\s*([^\s\]]*)\s*([^\s\]]*)\](?<!\\)/gi, '<a href="$1" download="$2" title="$3"/>$2</a>');
    // url
    text = text.replace(/(?<!\\)\[([^\s\]]+)\](?<!\\)\(([^\s\]]*)\s*([^\s\]]*)\)/gi, '<a href="$2" title="$3" target="_blank">$1</a>');
    text = text.replace(/(?<!\\)\((http[s]?:\/\/[^\s]+)\s*(((?!\s).)*)\)/gi, (_m, url: string, title: string) => {
      return url ? `<a href="${url}" title="${title}" target="_blank">${url}</a>` : _m;
    });
    // 普通标签
    text = text.replace(/(?<!\\)\[(?!#)(.+?)(?<!\\)\]/gi, "<span class='fk-tag'>$1</span>");
    text = text.replace(/__@left__/g, '[').replace(/__@right__/g, ']');
    // 列表
    if (a2 === '- ' || a2 === '* ') {
      const type = a2 === '- ' ? 1 : 2;
      this.list = this.addChild(this.list, { content: text.slice(2).trim(), level: tab, type }, tab);
      return;
    }
    // 表格
    const rows = text.replace(/\\\|/g, '__@vline__');
    const td = rows.split('|');
    const tdNum = td.length;
    if (a1 === '|' && tdNum > 1) {
      td.shift();
      this.table.push(td);
      return;
    }
    // 多行内容表格
    if (this.tables) {
      if (tdNum > 1) {
        this.table.push(td);
        this.tdNum = tdNum;
        return;
      }
      if (a3 === '---' && !this.tableThead) {
        this.tableThead = true;
        return;
      }
      if (/^-{2,}$/.test(text)) {
        this.td.push(this.col);
        this.col = '';
        if (this.tableThead) {
          if (this.td.length === this.tdNum) {
            this.table.push(this.td);
            this.td = [];
            return;
          }
        } else {
          this.table.push(this.td);
          this.td = [];
        }
        return;
      }
      if (text === ']') {
        this.td.push(this.col);
        this.table.push(this.td);
        this.td = [];
        this.tables = 0;
        this.tableHtml();
      } else {
        this.col += text + '\n';
      }
      return;
    }
    if (this.table.length) {
      if (a2 === '--') {
        this.tableThead = true;
        return;
      }
      this.tableHtml();
    }
    if (!text) {
      text = '';
      p = false;
    }
    if (p && text) text = `<p>${text}</p>`;
    this.arr.push(text === '' ? false : text);
  }
}

export default Fk;
