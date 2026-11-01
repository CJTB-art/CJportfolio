#!/usr/bin/env python3
"""Runs every draft's check (sympy / plain Python), discards failures, writes tools/out/drafts.json,
drafts-review.csv, drafts-discarded.json and drafts-summary.json. Nothing is merged into the app bank."""
import csv, json, math, signal, sys, os, collections
sys.path.insert(0, os.path.dirname(__file__))
from sympy import *
import drafts_a as A, drafts_b as B
OUT = os.path.join(os.path.dirname(__file__), '..', 'out')
x, y, n, t = symbols('x y n t'); xp = symbols('xp', positive=True)
GROUP = {'A': 'A', 'B': 'B', 'C': 'C'}

def run_check(src):
    ns = dict(globals()); ns.update(x=x, y=y, n=n, t=t, xp=xp, math=math)
    def boom(*_): raise TimeoutError('check timed out')
    signal.signal(signal.SIGALRM, boom); signal.alarm(20)
    try:
        exec(src, ns)
        flags = [bool(f) for f in ns['flags']]
        if len(flags) != 4: return False, f'flags has {len(flags)} entries'
        return True, flags
    except Exception as e:
        return False, f'{type(e).__name__}: {e}'
    finally:
        signal.alarm(0)

allq = [*A.CREATE, *A.EVALUATE, *B.LOGIC, *B.ASSESS, *B.RESEARCH, *B.TECH, *B.INVEST]
kept, dropped, per = [], [], collections.Counter()
for i0, d in enumerate(allq):
    # Balance the answer letters: swap the keyed option with the option at the target letter (cycling A,B,C,D).
    # The swap is appended to the stored check, so the check that is run is the check that is shipped.
    key = d['answer']; tgt = i0 % 4
    if key != tgt:
        ch = list(d['choices']); ch[key], ch[tgt] = ch[tgt], ch[key]; d = {**d, 'choices': ch}
        if d['check'] is not None: d['check'] += f"\n# options {'ABCD'[key]} and {'ABCD'[tgt]} swapped to balance answer letters\nflags[{key}],flags[{tgt}]=flags[{tgt}],flags[{key}]"
        key = tgt
    res, human = 'needs_human', d['check'] is None
    if not human:
        ok, flags = run_check(d['check'])
        if not ok: res = f'FAIL (error): {flags}'
        elif sum(flags) != 1 or not flags[key]: res = f'FAIL (flags {flags}, keyed {key})'
        else: res = 'pass'
        if res != 'pass':
            dropped.append({**d, 'check_result': res}); continue
    code = d['code']
    per[d['gap']] += 1
    kept.append(dict(
        id=f"draft-{code}-{d['bloom'][:3].lower()}-{per[d['gap']]:02d}-{d['gap'][:2].lower()}",
        category='Math Major', topic=A.T[code], tos=dict(target=A.T[code], code=code, group=code[0], confidence='exact'),
        question=d['question'], choices=d['choices'], answer='ABCD'[key], explanation=d['explanation'],
        bloom=d['bloom'], difficulty=d['difficulty'], status='review', source='draft-2026-10-24',
        gap=d['gap'], needs_human=human, check=d['check'], check_result=res))
# unique ids (gap + running number can repeat across blooms): renumber globally
for i, q in enumerate(kept, 1): q['id'] = f"draft-{q['tos']['code']}-{i:03d}"
os.makedirs(OUT, exist_ok=True)
json.dump(dict(note='DRAFTS ONLY. status review. Not merged into the app bank. needs_human items have no machine check.', count=len(kept), questions=kept), open(f'{OUT}/drafts.json', 'w'), ensure_ascii=False, indent=1)
json.dump(dropped, open(f'{OUT}/drafts-discarded.json', 'w'), ensure_ascii=False, indent=1)
with open(f'{OUT}/drafts-review.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f); w.writerow(['id','gap','topic','bloom','difficulty','question','A','B','C','D','key','explanation','check_result','needs_human','reviewer_ok','reviewer_notes'])
    for q in kept: w.writerow([q['id'],q['gap'],q['topic'],q['bloom'],q['difficulty'],q['question'],*q['choices'],q['answer'],q['explanation'],q['check_result'],'YES' if q['needs_human'] else 'no','',''])
summ = collections.OrderedDict()
for q in kept:
    s = summ.setdefault(q['gap'], dict(drafts=0, passed=0, needs_human=0)); s['drafts'] += 1
    s['passed' if q['check_result']=='pass' else 'needs_human'] += 1
tot = dict(drafts=len(kept), passed=sum(s['passed'] for s in summ.values()), needs_human=sum(s['needs_human'] for s in summ.values()), discarded=len(dropped))
bt = collections.Counter(); 
for q in kept: bt[(q['gap'], q['topic'] if q['gap']=='Thin topic' else q['bloom'])] += 1
json.dump(dict(perGap=summ, total=tot, detail={f'{a} / {b}': c for (a,b),c in sorted(bt.items())}), open(f'{OUT}/drafts-summary.json','w'), indent=1)
print(json.dumps(dict(perGap=summ, total=tot), indent=1))
for q in dropped: print('DISCARDED', q['code'], q['question'][:60], q['check_result'])
