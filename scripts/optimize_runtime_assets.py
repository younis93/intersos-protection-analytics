"""Lossless runtime asset optimization. Originals are retained outside public/."""
from pathlib import Path
import hashlib
import json
import shutil
import tempfile
from PIL import Image, ImageSequence

ROOT=Path(__file__).resolve().parents[1]
PUBLIC=ROOT/'frontend/public'
ARCHIVE=ROOT/'assets/archived-runtime-assets'

def signature(path):
    with Image.open(path) as image:
        frames=[]
        for frame in ImageSequence.Iterator(image):
            frame.load()
            frames.append((frame.size,hashlib.sha256(frame.convert('RGBA').tobytes()).hexdigest(),frame.info.get('duration',0)))
        visual_metadata={key:image.info.get(key) for key in ('icc_profile','gamma','srgb','chromaticity','background')}
        return frames,image.info.get('loop',0),visual_metadata

def main():
    report={'public_before_bytes':sum(p.stat().st_size for p in PUBLIC.rglob('*') if p.is_file()),'archived':[],'optimized':[]}
    if (PUBLIC/'favicon.png').exists(): report['public_before_bytes']-=(PUBLIC/'favicon.png').stat().st_size
    symbol=PUBLIC/'intersos-symbol.png'
    if not symbol.exists():symbol=ARCHIVE/'intersos-symbol.png'
    with Image.open(symbol) as image:
        image.thumbnail((64,64),Image.Resampling.LANCZOS)
        image.save(PUBLIC/'favicon.png',optimize=True)
    originals=ARCHIVE/'optimization-originals'
    for backup in originals.rglob('*') if originals.exists() else []:
        if backup.is_file():
            current=PUBLIC/backup.relative_to(originals)
            if not current.exists():current=ARCHIVE/backup.relative_to(originals)
            report['public_before_bytes']+=backup.stat().st_size-current.stat().st_size
    # Verified against frontend, HTML, CSS, desktop startup and dynamic clip paths.
    for name in ('guardian-fox','guardian-fox-3d','spider-mascot-3d','avatar','intersos-logo.png','intersos-symbol.png'):
        source=(PUBLIC/name).resolve(); target=(ARCHIVE/name).resolve()
        assert source.is_relative_to(PUBLIC.resolve()) and target.is_relative_to(ARCHIVE.resolve())
        if source.exists():
            if target.exists(): raise FileExistsError(target)
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.move(str(source),str(target)); report['archived'].append(name)
        elif target.exists():
            report['archived'].append(name)
            report['public_before_bytes']+=sum(p.stat().st_size for p in target.rglob('*') if p.is_file()) if target.is_dir() else target.stat().st_size
    for path in sorted(PUBLIC.rglob('*')):
        if path.suffix not in {'.png','.webp'}: continue
        before=path.stat().st_size
        with tempfile.TemporaryDirectory() as temp:
            candidate=Path(temp)/path.name
            with Image.open(path) as image:
                if path.suffix=='.png':
                    # Keep files with color-management or other metadata untouched.
                    if image.info: continue
                    image.save(candidate,optimize=True,compress_level=9)
                else:
                    frames=[]; durations=[]
                    for frame in ImageSequence.Iterator(image):
                        frame.load(); frames.append(frame.convert('RGBA').copy()); durations.append(frame.info.get('duration',0))
                    options={'lossless':True,'quality':30,'method':1,'exact':True}
                    if len(frames)>1: options.update(save_all=True,append_images=frames[1:],duration=durations,loop=image.info.get('loop',0),background=image.info.get('background',(0,0,0,0)))
                    frames[0].save(candidate,'WEBP',**options)
            if candidate.stat().st_size<before and signature(candidate)==signature(path):
                backup=originals/path.relative_to(PUBLIC); backup.parent.mkdir(parents=True,exist_ok=True)
                if not backup.exists(): shutil.copy2(path,backup)
                shutil.copyfile(candidate,path)
                report['optimized'].append({'asset':path.relative_to(PUBLIC).as_posix(),'before':before,'after':path.stat().st_size})
    report['optimized']=[{'asset':p.relative_to(originals).as_posix(),'before':p.stat().st_size,'after':((PUBLIC/p.relative_to(originals)) if (PUBLIC/p.relative_to(originals)).exists() else (ARCHIVE/p.relative_to(originals))).stat().st_size,'runtime':(PUBLIC/p.relative_to(originals)).exists()} for p in originals.rglob('*') if p.is_file()]
    report['public_after_bytes']=sum(p.stat().st_size for p in PUBLIC.rglob('*') if p.is_file())
    target=ROOT/'output/performance/runtime-assets.json'; target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))

if __name__=='__main__': main()
