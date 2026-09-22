"""把参考图转成字符画来读（当前模型无视觉能力，用像素读数代替看图）。
输出：
1) 全图字符画
2) 按连通块拆分每张卡片，各自输出字符画与包围盒
3) 深色线稿的灰度分布，判断是线稿还是实心剪影
"""
import sys, zlib, struct

def read_png(path):
    with open(path, 'rb') as f:
        data = f.read()
    pos = 8
    width = height = bitdepth = colortype = None
    idat = b''
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        ctype = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+length]
        if ctype == b'IHDR':
            width, height, bitdepth, colortype, _, _, _ = struct.unpack('>IIBBBBB', chunk)
        elif ctype == b'IDAT':
            idat += chunk
        elif ctype == b'IEND':
            break
        pos += 12 + length
    raw = zlib.decompress(idat)
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colortype]
    stride = width * channels
    pixels = bytearray(width * height * channels)
    prev = bytearray(stride)
    p = 0
    for y in range(height):
        filt = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        bpp = channels
        for i in range(stride):
            a = line[i-bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i-bpp] if i >= bpp else 0
            if filt == 0: x = line[i]
            elif filt == 1: x = (line[i] + a) & 255
            elif filt == 2: x = (line[i] + b) & 255
            elif filt == 3: x = (line[i] + (a + b) // 2) & 255
            elif filt == 4:
                pa = abs(b - c); pb = abs(a - c); pc = abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                x = (line[i] + pr) & 255
            else: x = line[i]
            line[i] = x
        pixels[y * stride:(y + 1) * stride] = line
        prev = line
    return width, height, channels, pixels

def gray_at(px, ch, w, x, y):
    i = (y * w + x) * ch
    r, g, b = px[i], px[i + 1], px[i + 2]
    return int(0.299 * r + 0.587 * g + 0.114 * b)

RAMP = ' .:-=+*#%@'

def ascii_art(px, ch, w, h, x0, y0, x1, y1, cols):
    """把指定区域转成字符画（暗处用重字符）"""
    rw = x1 - x0
    rh = y1 - y0
    rows = max(1, int(rh / rw * cols * 0.5))
    out = []
    for ry in range(rows):
        line = ''
        for rx in range(cols):
            sx = x0 + int(rx * rw / cols)
            sy = y0 + int(ry * rh / rows)
            if sx >= w: sx = w - 1
            if sy >= h: sy = h - 1
            g = gray_at(px, ch, w, sx, sy)
            idx = int((255 - g) / 255 * (len(RAMP) - 1))
            line += RAMP[idx]
        out.append(line)
    return '\n'.join(out)

def components(px, ch, w, h, dark_threshold=200):
    """把非白像素做连通块，返回最大几块的包围盒与像素数"""
    mask = bytearray(w * h)
    for y in range(h):
        base = y * w
        for x in range(w):
            if gray_at(px, ch, w, x, y) < dark_threshold:
                mask[base + x] = 1
    seen = bytearray(w * h)
    comps = []
    for start in range(w * h):
        if mask[start] == 0 or seen[start]:
            continue
        stack = [start]
        seen[start] = 1
        minx, maxx, miny, maxy = w, 0, h, 0
        count = 0
        while stack:
            cur = stack.pop()
            count += 1
            cx = cur % w
            cy = cur // w
            if cx < minx: minx = cx
            if cx > maxx: maxx = cx
            if cy < miny: miny = cy
            if cy > maxy: maxy = cy
            for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                if 0 <= nx < w and 0 <= ny < h:
                    ni = ny * w + nx
                    if mask[ni] and not seen[ni]:
                        seen[ni] = 1
                        stack.append(ni)
        comps.append({'count': count, 'box': (minx, miny, maxx, maxy),
                      'size': (maxx - minx + 1, maxy - miny + 1)})
    comps.sort(key=lambda c: -c['count'])
    return comps

if __name__ == '__main__':
    path = sys.argv[1] if len(sys.argv) > 1 else 'd:/working/play/shuerte/docs/refs/3.png'
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 120
    w, h, ch, px = read_png(path)
    print(f'尺寸 {w}x{h} 通道 {ch}')

    # 灰度直方图（判断是线稿还是实心）
    hist = {}
    for y in range(0, h, 3):
        for x in range(0, w, 3):
            bucket = gray_at(px, ch, w, x, y) // 32 * 32
            hist[bucket] = hist.get(bucket, 0) + 1
    total = sum(hist.values())
    print('灰度分布：', ' '.join(f'{k}:{v*100//total}%' for k, v in sorted(hist.items())))

    print('\n===== 全图字符画 =====')
    print(ascii_art(px, ch, w, h, 0, 0, w, h, cols))

    comps = components(px, ch, w, h)
    print('\n===== 连通块（前 6）=====')
    for i, c in enumerate(comps[:6]):
        print(f'#{i} 像素 {c["count"]} 包围盒 {c["box"]} 尺寸 {c["size"]}')

    for i, c in enumerate(comps[:3]):
        minx, miny, maxx, maxy = c['box']
        if c['count'] < 500:
            continue
        pad = 4
        print(f'\n===== 连通块 #{i} 字符画（包围盒 {c["box"]}）=====')
        print(ascii_art(px, ch, w, h, max(0, minx - pad), max(0, miny - pad),
                        min(w, maxx + pad), min(h, maxy + pad), cols))
