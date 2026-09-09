from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os

CYAN = (79, 211, 245)
CYAN_DIM = (29, 92, 110)
BG_DARK = (6, 10, 16)
BG_DARK2 = (10, 22, 34)

FONT_BOLD = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
FONT_SEMI = "/usr/share/fonts/truetype/google-fonts/Poppins-SemiBold.ttf"
if not os.path.exists(FONT_SEMI):
    FONT_SEMI = FONT_BOLD

def radial_bg(size, c1, c2, center=None):
    w, h = size
    img = Image.new("RGB", size, c2)
    if center is None:
        center = (w // 2, int(h * 0.15))
    maxd = math.hypot(max(center[0], w - center[0]), max(center[1], h - center[1]))
    px = img.load()
    for y in range(h):
        for x in range(w):
            d = math.hypot(x - center[0], y - center[1]) / maxd
            d = min(1, d)
            r = int(c1[0] + (c2[0] - c1[0]) * d)
            g = int(c1[1] + (c2[1] - c1[1]) * d)
            b = int(c1[2] + (c2[2] - c1[2]) * d)
            px[x, y] = (r, g, b)
    return img

def draw_orb(draw, cx, cy, radius, glow_img=None):
    # outer thin rings
    for rr, w, op in [(radius, 2, 140), (radius*0.85, 1, 90)]:
        bbox = [cx-rr, cy-rr, cx+rr, cy+rr]
        draw.ellipse(bbox, outline=CYAN + (op,) if False else CYAN, width=w)
    # glow circle (soft) - draw on separate layer then blur+paste by caller
    # core hexagon
    hex_r = radius * 0.55
    pts = []
    for i in range(6):
        ang = math.pi/180 * (60*i - 90)
        pts.append((cx + hex_r*math.cos(ang), cy + hex_r*math.sin(ang)))
    draw.polygon(pts, outline=CYAN, width=2, fill=(8, 27, 33))
    # inner glow core
    core_r = radius * 0.32
    draw.ellipse([cx-core_r, cy-core_r, cx+core_r, cy+core_r], fill=(126, 230, 251))
    small_r = radius*0.09
    draw.ellipse([cx-small_r, cy-small_r, cx+small_r, cy+small_r], fill=(255,255,255))

def draw_tracked(draw, xy, text, font, fill, tracking=0, anchor="la"):
    # anchor: 'la' left-aligned baseline-ish (top-left), 'ma' center-aligned
    widths = [draw.textlength(ch, font=font) for ch in text]
    total = sum(widths) + tracking * (len(text) - 1)
    x, y = xy
    if anchor == "ma":
        x -= total / 2
    cx = x
    for ch, w in zip(text, widths):
        draw.text((cx, y), ch, font=font, fill=fill)
        cx += w + tracking


def make_glow_layer(size, cx, cy, radius, color=CYAN, intensity=220, blur=18):
    layer = Image.new("RGBA", size, (0,0,0,0))
    d = ImageDraw.Draw(layer)
    d.ellipse([cx-radius, cy-radius, cx+radius, cy+radius], fill=color+(intensity,))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return layer

def orb_composite(size, cx, cy, radius):
    base = Image.new("RGBA", size, (0,0,0,0))
    glow = make_glow_layer(size, cx, cy, radius*0.85, intensity=160, blur=int(radius*0.35))
    base = Image.alpha_composite(base, glow)
    draw = ImageDraw.Draw(base)
    draw_orb(draw, cx, cy, radius)
    return base

# ---------------- App icon (square, transparent) ----------------
ICON_SIZE = 256
icon = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0,0,0,0))
bgcircle = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0,0,0,0))
d = ImageDraw.Draw(bgcircle)
d.ellipse([4,4,ICON_SIZE-4,ICON_SIZE-4], fill=(7,14,20,255))
icon = Image.alpha_composite(icon, bgcircle)
orb = orb_composite((ICON_SIZE, ICON_SIZE), ICON_SIZE//2, ICON_SIZE//2, int(ICON_SIZE*0.40))
icon = Image.alpha_composite(icon, orb)
# thin outer ring border
d2 = ImageDraw.Draw(icon)
d2.ellipse([4,4,ICON_SIZE-4,ICON_SIZE-4], outline=CYAN, width=4)
icon.save("/home/claude/kairos-desktop/build/icon_256.png")

# generate multi-size ICO
sizes = [16, 24, 32, 48, 64, 128, 256]
icon.save("/home/claude/kairos-desktop/build/icon.ico", sizes=[(s,s) for s in sizes])

# ---------------- Installer header (150x57) ----------------
HW, HH = 150, 57
header = radial_bg((HW, HH), BG_DARK2, BG_DARK, center=(30, HH//2))
horb = orb_composite((HW, HH), 30, HH//2, 20)
header = header.convert("RGBA")
header = Image.alpha_composite(header, horb).convert("RGB")
hd = ImageDraw.Draw(header)
try:
    f_word = ImageFont.truetype(FONT_SEMI, 20)
except Exception:
    f_word = ImageFont.load_default()
draw_tracked(hd, (56, HH//2 - 12), "KAIROS", f_word, (234, 246, 251), tracking=3)
header.save("/home/claude/kairos-desktop/build/installerHeader.bmp", "BMP")

# ---------------- Installer sidebar (164x314) ----------------
SW, SH = 164, 314
sidebar = radial_bg((SW, SH), BG_DARK2, BG_DARK, center=(SW//2, int(SH*0.34)))
sorb = orb_composite((SW, SH), SW//2, int(SH*0.34), 58)
sidebar = sidebar.convert("RGBA")
sidebar = Image.alpha_composite(sidebar, sorb).convert("RGB")
sd = ImageDraw.Draw(sidebar)
try:
    f_big = ImageFont.truetype(FONT_SEMI, 22)
    f_small = ImageFont.truetype(FONT_BOLD, 8)
except Exception:
    f_big = f_small = ImageFont.load_default()
draw_tracked(sd, (SW//2, int(SH*0.34)+72), "KAIROS", f_big, (234, 246, 251), tracking=4, anchor="ma")
tagline = "PERSONAL AI ASSISTANT"
draw_tracked(sd, (SW//2, int(SH*0.34)+108), tagline, f_small, (127, 166, 179), tracking=1, anchor="ma")
# thin divider rule near bottom
sd.line([(24, SH-34), (SW-24, SH-34)], fill=(79,211,245,80), width=1)
sd.text((SW//2, SH-20), "v1.1.0", font=f_small, fill=(90, 130, 145), anchor="mm")
sidebar.save("/home/claude/kairos-desktop/build/installerSidebar.bmp", "BMP")

print("done", os.listdir("/home/claude/kairos-desktop/build"))
