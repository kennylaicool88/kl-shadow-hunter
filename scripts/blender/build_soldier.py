# Builds the KL Shadow Hunter hostile soldier from the "Tactical Soldier Turnaround Sheet" reference:
# shemagh head/face wrap, brown work shirt with rolled sleeves, olive plate carrier with magazine and
# utility pouches, hydration pack, belt, woodland-camo cargo trousers, tan laced boots, black gloves.
# Rigged (Mixamo-style bone names the game's IK expects) with Idle / Walk / Run clips, exported as GLB.
#
# Run headless:  blender --background --factory-startup --python scripts/blender/build_soldier.py -- <out.glb> [previewDir]
# Original model and procedurally generated textures (no third-party assets).
import bpy, bmesh, math, sys, os, tempfile
import numpy as np
from mathutils import Vector, Matrix, Quaternion

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = os.path.abspath(argv[0] if argv else 'kl_soldier.glb')
PREVIEW = argv[1] if len(argv) > 1 else None
TEXDIR = os.path.join(tempfile.gettempdir(), 'kl_soldier_tex')  # source PNGs; the GLB embeds JPEG copies
os.makedirs(TEXDIR, exist_ok=True)

# ----------------------------------------------------------------------------- scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24
rng = np.random.default_rng(7)

def log(*a):
    print('[soldier]', *a, flush=True)

# ----------------------------------------------------------------------------- textures (numpy)
def blur_noise(n, scale):
    """Tileable smooth noise via FFT low-pass."""
    f = np.fft.fft2(rng.standard_normal((n, n)))
    ky = np.fft.fftfreq(n)[:, None]; kx = np.fft.fftfreq(n)[None, :]
    f *= np.exp(-(kx * kx + ky * ky) * (scale ** 2))
    a = np.real(np.fft.ifft2(f))
    return (a - a.min()) / (a.max() - a.min() + 1e-9)

def save_img(name, rgb):
    n = rgb.shape[0]
    rgba = np.concatenate([rgb, np.ones((n, n, 1))], axis=2).astype(np.float32)
    img = bpy.data.images.new(name, n, n, alpha=False)
    img.pixels.foreach_set(np.flipud(rgba).ravel())
    path = os.path.join(TEXDIR, f'{name}.png')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    return img

def lin(c):  # sRGB-ish hex/tuple to linear-ish float rgb used directly for base colour textures (sRGB colourspace)
    return np.array(c, dtype=np.float32)

def fabric_grain(n, amt):
    g = blur_noise(n, 1.2)
    weave = (np.sin(np.arange(n)[:, None] * 1.9) * np.sin(np.arange(n)[None, :] * 1.9)) * 0.5 + 0.5
    return 1 - amt + amt * (0.6 * g + 0.4 * weave)

def tex_camo(n=512):
    base = np.zeros((n, n, 3)) + lin((0.58, 0.50, 0.37))
    layers = [((0.40, 0.31, 0.21), 22, 0.52), ((0.30, 0.31, 0.20), 18, 0.56), ((0.13, 0.12, 0.10), 14, 0.66)]
    for col, sc, th in layers:
        m = blur_noise(n, sc) > th
        base[m] = col
    return base * fabric_grain(n, 0.25)[..., None]

def tex_shemagh(n=256):
    x, y = np.meshgrid(np.arange(n), np.arange(n))
    cell = 16
    u, v = (x % cell) / cell - 0.5, (y % cell) / cell - 0.5
    diamond = (np.abs(u) + np.abs(v)) < 0.32
    stripe = ((y // cell) % 6 == 0) & ((y % cell) < 4)
    dark = diamond | stripe
    col = np.where(dark[..., None], lin((0.09, 0.08, 0.07)), lin((0.80, 0.74, 0.62)))
    return col * fabric_grain(n, 0.2)[..., None]

def tex_plain(color, n=256, grain=0.3, mottle=0.25):
    m = blur_noise(n, 8)
    c = lin(color)[None, None, :] * (1 - mottle * 0.5 + mottle * m[..., None])
    return c * fabric_grain(n, grain)[..., None]

def tex_molle(color, n=256):
    c = tex_plain(color, n, 0.35, 0.2)
    y = np.arange(n)[:, None] * np.ones((1, n))
    band = (y % 32) < 4
    c[band] *= 0.55
    return c

# ----------------------------------------------------------------------------- materials
def material(name, img=None, color=(0.5, 0.5, 0.5), rough=0.85, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if img is not None:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = img
        nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (*color, 1)
    return m

log('textures')
M = {
    # "Body*" materials are tinted per team / class by the game (SoldierRig).
    'shirt': material('Body_Shirt', save_img('shirt', tex_plain((0.29, 0.22, 0.16), grain=0.35))),
    'pants': material('Body_Pants', save_img('camo', tex_camo())),
    'vest': material('Gear_Vest', save_img('cordura', tex_molle((0.30, 0.30, 0.19))), rough=0.9),
    'pouch': material('Gear_Pouch', save_img('pouch', tex_plain((0.33, 0.32, 0.21), grain=0.4)), rough=0.9),
    'shemagh': material('Gear_Shemagh', save_img('shemagh', tex_shemagh()), rough=0.95),
    'boots': material('Gear_Boots', save_img('suede', tex_plain((0.60, 0.50, 0.36), grain=0.2, mottle=0.4)), rough=0.95),
    'sole': material('Gear_Sole', color=(0.02, 0.018, 0.016), rough=0.9),
    'gloves': material('Gear_Gloves', save_img('glove', tex_plain((0.05, 0.05, 0.05), grain=0.4)), rough=0.7),
    'belt': material('Gear_Belt', color=(0.045, 0.03, 0.018), rough=0.7),
    'metal': material('Gear_Metal', color=(0.25, 0.25, 0.24), rough=0.4, metal=1.0),
    'skin': material('Skin', color=(0.19, 0.11, 0.07), rough=0.6),
    'eyes': material('Eyes', color=(0.03, 0.025, 0.02), rough=0.2),
    'magazine': material('Gear_Mag', color=(0.06, 0.06, 0.06), rough=0.5, metal=0.4),
}

# ----------------------------------------------------------------------------- geometry helpers
parts = []

def finish(obj, mat, uv_scale=0.25, smooth=True):
    obj.data.materials.clear()
    obj.data.materials.append(M[mat])
    for mod in list(obj.modifiers):
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    box_uv(obj, uv_scale)
    for p in obj.data.polygons:
        p.use_smooth = smooth
    parts.append(obj)
    return obj

def box_uv(obj, scale):
    me = obj.data
    # one UV layer with a fixed name on every part, so joined parts share it
    while len(me.uv_layers): me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name='UVMap')
    bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv['UVMap']
    mw = obj.matrix_world
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            co = mw @ l.vert.co
            a, b = [(co.y, co.z), (co.x, co.z), (co.x, co.y)][ax]
            l[uv].uv = (a / scale, b / scale)
    bm.to_mesh(me); bm.free()

def cube(name, size, loc, mat, bevel=0.01, rot=(0, 0, 0), uv=0.25, segs=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = o.modifiers.new('Bevel', 'BEVEL'); b.width = bevel; b.segments = segs; b.limit_method = 'ANGLE'
    return finish(o, mat, uv, smooth=True)

def cyl(name, r, depth, loc, mat, rot=(0, 0, 0), verts=16, r2=None, uv=0.25, bevel=0.0):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.active_object; o.name = name
    if bevel:
        b = o.modifiers.new('Bevel', 'BEVEL'); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'
    return finish(o, mat, uv)

def sphere(name, r, loc, mat, scale=(1, 1, 1), segs=24, rings=16, uv=0.25):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=rings)
    o = bpy.context.active_object; o.name = name
    o.scale = scale
    return finish(o, mat, uv)

def torus(name, R, r, loc, mat, rot=(0, 0, 0), scale=(1, 1, 1), uv=0.25):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, rotation=rot, major_segments=24, minor_segments=8)
    o = bpy.context.active_object; o.name = name
    o.scale = scale
    return finish(o, mat, uv)

# ----------------------------------------------------------------------------- skeleton layout (metres, faces +Y, right = +X)
J = {
    'Hips': (0, 0, 0.98), 'Spine': (0, 0.0, 1.06), 'Spine1': (0, -0.005, 1.18), 'Spine2': (0, -0.01, 1.30),
    'Neck': (0, 0.0, 1.47), 'Head': (0, 0.01, 1.57), 'HeadTop': (0, 0.01, 1.80),
}
for s, x in (('Right', 1), ('Left', -1)):
    J[f'{s}Shoulder'] = (x * 0.04, -0.01, 1.42)
    J[f'{s}Arm'] = (x * 0.19, -0.01, 1.44)
    J[f'{s}ForeArm'] = (x * 0.355, 0.0, 1.19)
    J[f'{s}Hand'] = (x * 0.495, 0.02, 0.965)
    J[f'{s}HandEnd'] = (x * 0.56, 0.03, 0.87)
    J[f'{s}UpLeg'] = (x * 0.10, 0.0, 0.94)
    J[f'{s}Leg'] = (x * 0.105, 0.015, 0.52)
    J[f'{s}Foot'] = (x * 0.11, -0.01, 0.10)
    J[f'{s}ToeBase'] = (x * 0.11, 0.12, 0.03)
    J[f'{s}ToeEnd'] = (x * 0.11, 0.2, 0.03)
V = {k: Vector(v) for k, v in J.items()}

# ----------------------------------------------------------------------------- body (skin modifier over a joint graph)
log('body')
pts, edges, radii = [], [], []
def P(key_or_vec, r):
    pts.append(tuple(V[key_or_vec]) if isinstance(key_or_vec, str) else tuple(key_or_vec)); radii.append(r); return len(pts) - 1
def E(a, b): edges.append((a, b))

pelvis = P('Hips', (0.165, 0.12))
lower_back = P(Vector((0, 0, 1.12)), (0.155, 0.11))
chest = P(Vector((0, -0.01, 1.30)), (0.19, 0.125))
upper_chest = P(Vector((0, -0.01, 1.40)), (0.2, 0.12))
neck = P(Vector((0, 0.0, 1.53)), (0.055, 0.055))
E(pelvis, lower_back); E(lower_back, chest); E(chest, upper_chest); E(upper_chest, neck)
for s in ('Right', 'Left'):
    sh = P(f'{s}Arm', (0.07, 0.07)); E(upper_chest, sh)
    mid_up = P((V[f'{s}Arm'] + V[f'{s}ForeArm']) / 2, (0.063, 0.063)); E(sh, mid_up)
    el = P(f'{s}ForeArm', (0.052, 0.052)); E(mid_up, el)
    fore = P(V[f'{s}ForeArm'].lerp(V[f'{s}Hand'], 0.55), (0.046, 0.043)); E(el, fore)
    wr = P(V[f'{s}Hand'] + (V[f'{s}ForeArm'] - V[f'{s}Hand']).normalized() * 0.02, (0.036, 0.032)); E(fore, wr)
    hip = P(V[f'{s}UpLeg'] + Vector((0, 0, -0.02)), (0.1, 0.105)); E(pelvis, hip)
    thigh = P(V[f'{s}UpLeg'].lerp(V[f'{s}Leg'], 0.5), (0.088, 0.09)); E(hip, thigh)
    knee = P(f'{s}Leg', (0.072, 0.075)); E(thigh, knee)
    calf = P(V[f'{s}Leg'].lerp(V[f'{s}Foot'], 0.45), (0.07, 0.072)); E(knee, calf)
    ank = P(V[f'{s}Foot'] + Vector((0, 0, 0.12)), (0.062, 0.062)); E(calf, ank)

me = bpy.data.meshes.new('body')
me.from_pydata(pts, edges, [])
body = bpy.data.objects.new('GEO-body', me)
scene.collection.objects.link(body)
sk = body.modifiers.new('Skin', 'SKIN')
sk.use_smooth_shade = True
for i, r in enumerate(radii):
    body.data.skin_vertices[''].data[i].radius = r
body.data.skin_vertices[''].data[pelvis].use_root = True
ss = body.modifiers.new('Sub', 'SUBSURF'); ss.levels = 2
bpy.context.view_layer.objects.active = body
for m in list(body.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
# Shirt above the belt (and on the arms down to the rolled cuff), camo trousers below, skin on the forearms.
body.data.materials.append(M['shirt']); body.data.materials.append(M['pants']); body.data.materials.append(M['skin'])
for p in body.data.polygons:
    c = p.center
    arm = abs(c.x) > 0.2 and c.z > 0.9
    if arm:
        # distance along the arm from the shoulder
        s = 'Right' if c.x > 0 else 'Left'
        a, b = V[f'{s}Arm'], V[f'{s}Hand']
        t = (c - a).dot(b - a) / (b - a).length_squared
        p.material_index = 0 if t < 0.62 else 2
    else:
        p.material_index = 0 if c.z > 1.0 else 1
box_uv(body, 0.22)
for p in body.data.polygons:
    p.use_smooth = True
parts.append(body)

# ----------------------------------------------------------------------------- head + shemagh
log('head')
sphere('GEO-head', 0.105, (0, 0.012, 1.675), 'skin', scale=(0.92, 1.0, 1.12))
for x in (-0.034, 0.034):
    sphere(f'GEO-eye{x}', 0.012, (x, 0.098, 1.685), 'eyes', segs=10, rings=6)
# Wrap: slightly larger head shell with an eye slit cut out of the front
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.118, location=(0, 0.008, 1.68), segments=32, ring_count=20)
wrap = bpy.context.active_object; wrap.name = 'GEO-shemagh'
wrap.scale = (0.95, 1.02, 1.14)
bpy.ops.object.transform_apply(scale=True)
bm = bmesh.new(); bm.from_mesh(wrap.data)
kill = [f for f in bm.faces if (lambda c: c.y > 0.04 and 1.665 < c.z < 1.705 and abs(c.x) < 0.075)(f.calc_center_median())]
bmesh.ops.delete(bm, geom=kill, context='FACES')
bm.to_mesh(wrap.data); bm.free()
sol = wrap.modifiers.new('Sol', 'SOLIDIFY'); sol.thickness = 0.008
finish(wrap, 'shemagh', 0.32)
# Folds and knot at the back of the head, scarf around the neck with a front drape
torus('GEO-shemagh_band', 0.11, 0.016, (0, 0.0, 1.735), 'shemagh', rot=(math.radians(-12), 0, 0), scale=(0.95, 1.05, 1), uv=0.32)
sphere('GEO-shemagh_knot', 0.045, (0, -0.11, 1.70), 'shemagh', scale=(1.2, 0.8, 0.9), segs=12, rings=8)
for x in (-0.03, 0.03):
    cube(f'GEO-shemagh_tail{x}', (0.05, 0.015, 0.16), (x, -0.13, 1.6), 'shemagh', bevel=0.006, rot=(math.radians(10), math.radians(x * 300), 0))
torus('GEO-scarf', 0.085, 0.035, (0, 0.0, 1.52), 'shemagh', scale=(1.25, 1.05, 0.9), uv=0.32)
bpy.ops.mesh.primitive_cone_add(radius1=0.11, radius2=0.01, depth=0.2, vertices=3, location=(0, 0.1, 1.44), rotation=(math.radians(180), 0, 0))
drape = bpy.context.active_object; drape.name = 'GEO-scarf_drape'
drape.scale = (1.0, 0.25, 1.0)
finish(drape, 'shemagh', 0.32, smooth=False)

# ----------------------------------------------------------------------------- plate carrier + pouches + hydration pack
log('gear')
cube('GEO-vest_front', (0.36, 0.07, 0.36), (0, 0.105, 1.29), 'vest', bevel=0.025, uv=0.15)
cube('GEO-vest_back', (0.36, 0.06, 0.38), (0, -0.115, 1.30), 'vest', bevel=0.025, uv=0.15)
for x in (-0.15, 0.15):
    cube(f'GEO-vest_strap{x}', (0.07, 0.24, 0.025), (x, -0.005, 1.475), 'vest', bevel=0.008)
    cube(f'GEO-vest_side{x}', (0.035, 0.2, 0.16), (x * 1.24, -0.005, 1.2), 'vest', bevel=0.01)
# Front: three rifle-magazine pouches with magazines peeking out, two utility pouches below
for i, x in enumerate((-0.09, 0.0, 0.09)):
    cube(f'GEO-mag_pouch{i}', (0.075, 0.055, 0.12), (x, 0.165, 1.27), 'pouch', bevel=0.012)
    cube(f'GEO-mag{i}', (0.055, 0.03, 0.05), (x, 0.162, 1.345), 'magazine', bevel=0.004)
    cube(f'GEO-mag_flap{i}', (0.078, 0.06, 0.025), (x, 0.168, 1.33), 'pouch', bevel=0.008)
for x in (-0.13, 0.13):
    cube(f'GEO-util_pouch{x}', (0.09, 0.06, 0.1), (x, 0.15, 1.15), 'pouch', bevel=0.014)
cube('GEO-hydration', (0.27, 0.085, 0.33), (0, -0.175, 1.3), 'vest', bevel=0.03, uv=0.15)
cube('GEO-hydration_patch', (0.12, 0.012, 0.07), (0, -0.222, 1.4), 'pouch', bevel=0.004)
for x in (-0.14, 0.14):
    cube(f'GEO-back_pouch{x}', (0.06, 0.06, 0.11), (x * 1.15, -0.12, 1.12), 'pouch', bevel=0.012)
# Belt with buckle
torus('GEO-belt', 0.165, 0.022, (0, 0.0, 1.0), 'belt', scale=(1.0, 0.75, 1.3))
cube('GEO-buckle', (0.06, 0.02, 0.045), (0, 0.128, 1.0), 'metal', bevel=0.004)

# ----------------------------------------------------------------------------- trousers detail, cuffs, gloves, boots
log('limbs')
for s, x in (('Right', 1), ('Left', -1)):
    leg_mid = V[f'{s}UpLeg'].lerp(V[f'{s}Leg'], 0.62)
    cube(f'GEO-cargo_{s}', (0.035, 0.12, 0.15), (x * 0.185, leg_mid.y + 0.01, leg_mid.z), 'pants', bevel=0.015, uv=0.22)
    cube(f'GEO-cargo_flap_{s}', (0.04, 0.125, 0.035), (x * 0.188, leg_mid.y + 0.01, leg_mid.z + 0.075), 'pants', bevel=0.01, uv=0.22)
    calf = V[f'{s}Leg'].lerp(V[f'{s}Foot'], 0.45)
    cube(f'GEO-calf_pocket_{s}', (0.03, 0.08, 0.1), (x * 0.165, calf.y, calf.z), 'pants', bevel=0.01, uv=0.22)
    # Rolled sleeve cuff
    a, h = V[f'{s}Arm'], V[f'{s}Hand']
    cuffp = a.lerp(h, 0.6)
    d = (h - a).normalized()
    rot = Vector((0, 0, 1)).rotation_difference(d).to_euler()
    torus(f'GEO-cuff_{s}', 0.048, 0.016, tuple(cuffp), 'shirt', rot=tuple(rot))
    # Glove: palm + four fingers + thumb, along the hand direction
    hand_c = V[f'{s}Hand'].lerp(V[f'{s}HandEnd'], 0.35)
    hd = (V[f'{s}HandEnd'] - V[f'{s}Hand']).normalized()
    hrot = Vector((0, 0, -1)).rotation_difference(hd).to_euler()
    cube(f'GEO-palm_{s}', (0.035, 0.085, 0.09), tuple(hand_c), 'gloves', bevel=0.015, rot=tuple(hrot))
    for k in range(4):
        fp = V[f'{s}HandEnd'] + Vector((0, 0.03 - k * 0.02, -0.01))
        cyl(f'GEO-finger_{s}{k}', 0.009, 0.07, tuple(fp), 'gloves', rot=tuple(hrot), verts=8)
    cyl(f'GEO-thumb_{s}', 0.011, 0.06, tuple(hand_c + Vector((-x * 0.0, 0.05, 0.0))), 'gloves', rot=(math.radians(60), 0, 0), verts=8)
    cyl(f'GEO-glove_cuff_{s}', 0.04, 0.04, tuple(V[f'{s}Hand'] - hd * 0.005), 'gloves', rot=tuple(hrot), verts=12)
    # Boot: shaft, foot, toe cap, sole, lace band
    f = V[f'{s}Foot']
    cyl(f'GEO-boot_shaft_{s}', 0.068, 0.2, (f.x, f.y, 0.17), 'boots', verts=16, bevel=0.01)
    cube(f'GEO-boot_foot_{s}', (0.11, 0.25, 0.1), (f.x, 0.045, 0.065), 'boots', bevel=0.035, uv=0.15)
    sphere(f'GEO-boot_toe_{s}', 0.055, (f.x, 0.14, 0.06), 'boots', scale=(1.0, 1.1, 0.75), segs=14, rings=8)
    cube(f'GEO-boot_sole_{s}', (0.115, 0.29, 0.025), (f.x, 0.05, 0.0125), 'sole', bevel=0.008)
    for k in range(5):
        cube(f'GEO-lace_{s}{k}', (0.05, 0.006, 0.006), (f.x, 0.075 - k * 0.012 if k < 2 else 0.066, 0.1 + k * 0.035), 'belt', bevel=0)
    torus(f'GEO-trouser_cuff_{s}', 0.075, 0.018, (f.x, f.y, 0.27), 'pants', uv=0.22)

# ----------------------------------------------------------------------------- join
log('join', len(parts))
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
mesh = bpy.context.active_object
mesh.name = 'Soldier_Mesh'
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')
log('mesh verts', len(mesh.data.vertices), 'tris', sum(len(p.vertices) - 2 for p in mesh.data.polygons))

# ----------------------------------------------------------------------------- armature
log('armature')
arm_data = bpy.data.armatures.new('SoldierRig')
arm = bpy.data.objects.new('Soldier', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
BONES = [  # name, head key, tail key, parent
    ('Hips', 'Hips', 'Spine', None), ('Spine', 'Spine', 'Spine1', 'Hips'), ('Spine1', 'Spine1', 'Spine2', 'Spine'),
    ('Spine2', 'Spine2', 'Neck', 'Spine1'), ('Neck', 'Neck', 'Head', 'Spine2'), ('Head', 'Head', 'HeadTop', 'Neck'),
]
for s in ('Right', 'Left'):
    BONES += [
        (f'{s}Shoulder', f'{s}Shoulder', f'{s}Arm', 'Spine2'), (f'{s}Arm', f'{s}Arm', f'{s}ForeArm', f'{s}Shoulder'),
        (f'{s}ForeArm', f'{s}ForeArm', f'{s}Hand', f'{s}Arm'), (f'{s}Hand', f'{s}Hand', f'{s}HandEnd', f'{s}ForeArm'),
        (f'{s}UpLeg', f'{s}UpLeg', f'{s}Leg', 'Hips'), (f'{s}Leg', f'{s}Leg', f'{s}Foot', f'{s}UpLeg'),
        (f'{s}Foot', f'{s}Foot', f'{s}ToeBase', f'{s}Leg'), (f'{s}ToeBase', f'{s}ToeBase', f'{s}ToeEnd', f'{s}Foot'),
    ]
eb = arm_data.edit_bones
for name, h, t, parent in BONES:
    b = eb.new(name)
    b.head = V[h]; b.tail = V[t]
    if parent:
        b.parent = eb[parent]
        b.use_connect = (eb[parent].tail - b.head).length < 1e-4
bpy.ops.object.mode_set(mode='OBJECT')

# ----------------------------------------------------------------------------- skin weights (distance to bone segments, two nearest in the region's chain)
log('weights')
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (a + ab * t - p).length

bone_segs = {name: (V[h], V[t]) for name, h, t, _ in BONES}
TORSO = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'RightShoulder', 'LeftShoulder']
def candidates(p):
    side = 'Right' if p.x > 0 else 'Left'
    if p.z > 1.5 and abs(p.x) < 0.16:
        return ['Head', 'Neck', 'Spine2']
    # arm: beyond the shoulder line, above the hips
    if p.z > 0.82:
        a, h = V[f'{side}Arm'], V[f'{side}HandEnd']
        if abs(p.x) > 0.205 or seg_dist(p, a, h) < 0.075:
            return [f'{side}Shoulder', f'{side}Arm', f'{side}ForeArm', f'{side}Hand']
    if p.z < 0.95 and abs(p.x) > 0.015:
        return ['Hips', f'{side}UpLeg', f'{side}Leg', f'{side}Foot', f'{side}ToeBase']
    return TORSO

groups = {name: mesh.vertex_groups.new(name=name) for name, *_ in BONES}
for v in mesh.data.vertices:
    p = v.co
    cands = candidates(p)
    ds = sorted(((seg_dist(p, *bone_segs[n]), n) for n in cands), key=lambda x: x[0])
    (d0, n0), (d1, n1) = ds[0], ds[1] if len(ds) > 1 else (ds[0][0] + 1, ds[0][1])
    w0 = 1.0 / (d0 ** 4 + 1e-6); w1 = 1.0 / (d1 ** 4 + 1e-6)
    # only blend near joints
    if d1 > d0 * 1.8: w1 = 0
    tot = w0 + w1
    groups[n0].add([v.index], w0 / tot, 'REPLACE')
    if w1 > 0: groups[n1].add([v.index], w1 / tot, 'ADD')

mesh.parent = arm
mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = arm

# ----------------------------------------------------------------------------- animation (world-axis rotations converted into each bone's rest frame)
log('animation')
rest = {b.name: b.matrix_local.to_quaternion() for b in arm_data.bones}
for pb in arm.pose.bones:
    pb.rotation_mode = 'QUATERNION'

def rot(name, axis, deg):
    q_world = Quaternion(Vector(axis), math.radians(deg))
    r = rest[name]
    return r.inverted() @ q_world @ r

def key_pose(frame, pose, hips_lift=0.0):
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    for name, rots in pose.items():
        q = Quaternion()
        for axis, deg in rots:
            q = rot(name, axis, deg) @ q
        arm.pose.bones[name].rotation_quaternion = q
    # hips bob: world Z -> Hips rest frame
    arm.pose.bones['Hips'].location = rest['Hips'].inverted() @ Vector((0, 0, hips_lift))
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=frame)
        pb.keyframe_insert('location', frame=frame)

X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
ARMS_DOWN = {'RightArm': [(Y, -38)], 'LeftArm': [(Y, 38)], 'RightForeArm': [(X, 25)], 'LeftForeArm': [(X, 25)]}

def cycle_pose(phase, stride, knee, arm_sw, lean, bob):
    s = math.sin(phase * 2 * math.pi)
    c = math.cos(phase * 2 * math.pi)
    pose = {k: list(v) for k, v in ARMS_DOWN.items()}
    pose['RightUpLeg'] = [(X, stride * s)]
    pose['LeftUpLeg'] = [(X, -stride * s)]
    # knee bends while the leg swings forward (lifted), straight at contact
    pose['RightLeg'] = [(X, -knee * max(0.0, -c) ** 1.2 - 4)]
    pose['LeftLeg'] = [(X, -knee * max(0.0, c) ** 1.2 - 4)]
    pose['RightFoot'] = [(X, 6 * s)]
    pose['LeftFoot'] = [(X, -6 * s)]
    pose['RightArm'] = pose['RightArm'] + [(X, -arm_sw * s)]
    pose['LeftArm'] = pose['LeftArm'] + [(X, arm_sw * s)]
    pose['Spine'] = [(X, lean), (Z, 4 * s)]
    pose['Spine2'] = [(Z, -6 * s)]
    pose['Hips'] = [(Z, -5 * s)]
    return pose, bob * abs(math.cos(phase * 2 * math.pi))

def make_action(name, frames, fn):
    ad = arm.animation_data_create()
    act = bpy.data.actions.new(name)
    ad.action = act
    for f in range(frames + 1):
        pose, lift = fn(f / frames)
        key_pose(f + 1, pose, lift)
    act.use_fake_user = True
    # keep the action in the NLA so the exporter writes it as its own clip
    track = ad.nla_tracks.new(); track.name = name
    track.strips.new(name, 1, act)
    ad.action = None
    return act

make_action('Idle', 48, lambda t: ({**{k: list(v) for k, v in ARMS_DOWN.items()},
                                    'Spine1': [(X, 1.5 * math.sin(t * 2 * math.pi))], 'Spine2': [(X, 1.0 * math.sin(t * 2 * math.pi))],
                                    'Head': [(Z, 3 * math.sin(t * 2 * math.pi))], 'Hips': [(Y, 1.2 * math.sin(t * 2 * math.pi))],
                                    'RightLeg': [(X, -3)], 'LeftLeg': [(X, -5)]}, 0.006 * math.sin(t * 4 * math.pi)))
make_action('Walk', 24, lambda t: cycle_pose(t, 24, 45, 16, 3, 0.025))
make_action('Run', 16, lambda t: cycle_pose(t, 42, 95, 32, 12, 0.05))

# ----------------------------------------------------------------------------- previews (front / side / back, compared with the turnaround sheet)
if PREVIEW:
    log('preview')
    for tr in arm.animation_data.nla_tracks: tr.mute = True
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    os.makedirs(PREVIEW, exist_ok=True)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 600, 900
    world = bpy.data.worlds.new('W'); scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.12, 0.12, 0.13, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    for name, loc, energy in (('key', (2, 3, 3), 250), ('fill', (-3, 2, 2), 90), ('rim', (0, -3, 3), 200)):
        ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.size = 3
        lo = bpy.data.objects.new(name, ld); scene.collection.objects.link(lo)
        lo.location = loc
        lo.rotation_euler = (Vector((0, 0, 0.9)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'; cd.ortho_scale = 2.0
    cam = bpy.data.objects.new('cam', cd); scene.collection.objects.link(cam); scene.camera = cam
    for view, pos in (('front', (0, 5, 0.92)), ('side', (5, 0, 0.92)), ('back', (0, -5, 0.92))):
        cam.location = pos
        cam.rotation_euler = (Vector((0, 0, 0.92)) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f'soldier_{view}.png')
        bpy.ops.render.render(write_still=True)
    # walk pose check
    arm.animation_data.action = bpy.data.actions['Walk']
    scene.frame_set(7)
    cam.location = (3.5, 3.5, 1.0)
    cam.rotation_euler = (Vector((0, 0, 0.92)) - Vector(cam.location)).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(PREVIEW, 'soldier_walk.png')
    bpy.ops.render.render(write_still=True)
    arm.animation_data.action = None
    for tr in arm.animation_data.nla_tracks: tr.mute = False
    scene.frame_set(1)

# ----------------------------------------------------------------------------- export
log('export', OUT)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=False, export_animations=True,
    export_animation_mode='ACTIONS', export_skins=True, export_apply=False,
    export_image_format='JPEG', export_jpeg_quality=88, export_lights=False, export_cameras=False,
)
log('done', os.path.getsize(OUT) // 1024, 'KB')
