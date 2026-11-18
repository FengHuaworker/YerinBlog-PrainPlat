/** 验证码：Worker 生成 SVG（原版 GD 的替代） */

import { randStr } from './util';

export function makeCaptchaCode(length: number): string {
  return randStr(Math.max(3, Math.min(6, length || 4)), 0).toUpperCase();
}

/** 生成 SVG 验证码图片 */
export function captchaSvg(code: string, width = 86, height = 28): string {
  const w = Math.max(60, width);
  const h = Math.max(23, height);
  const colors = ['#5d677c', '#8783e1', '#f1716c', '#26bc5c', '#768fe7', '#f57e00', '#9e83e1'];
  const chars = code.split('');
  const step = w / (chars.length + 0.6);
  let body = '';
  // 背景噪点
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    body += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(Math.random() * 1.2).toFixed(1)}" fill="${colors[Math.floor(Math.random() * colors.length)]}" opacity="0.35"/>`;
  }
  // 干扰线
  for (let i = 0; i < 3; i++) {
    const y1 = Math.random() * h;
    const y2 = Math.random() * h;
    body += `<path d="M0 ${y1.toFixed(1)} Q ${(w / 2).toFixed(1)} ${(Math.random() * h).toFixed(1)} ${w} ${y2.toFixed(1)}" stroke="${colors[Math.floor(Math.random() * colors.length)]}" stroke-width="1" fill="none" opacity="0.45"/>`;
  }
  chars.forEach((ch, i) => {
    const x = step * (i + 0.55);
    const y = h / 2 + 5 + (Math.random() * 4 - 2);
    const rotate = Math.random() * 26 - 13;
    const color = colors[Math.floor(Math.random() * colors.length)];
    body += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="Verdana,DejaVu Sans,sans-serif" font-size="${(h * 0.62).toFixed(0)}" font-weight="bold" fill="${color}" transform="rotate(${rotate.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${ch}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#f7f8fa"/>${body}</svg>`;
}
