# 90-second demo path: A 中文 → B Español, both directions, Send & Catch, Sanctuary, three outputs.
import asyncio, re, math, json, sys
from playwright.async_api import async_playwright
PORT = int(sys.argv[1]); TAG = ('ai' if PORT == 8771 else 'nokey') + (sys.argv[2] if len(sys.argv) > 2 else '')
OUT = sys.argv[3] if len(sys.argv) > 3 else 'out'
def one(s): return s.replace('\n', ' | ')
async def main():
    errs = []
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' and '404' not in m.text else None)
        await pg.goto(f'http://127.0.0.1:{PORT}/fake.html?debug'); await pg.wait_for_timeout(600)
        await pg.get_by_role('radio', name=re.compile('Free canvas')).click()
        await pg.get_by_label('Participant A language').select_option('zh')
        await pg.get_by_label('Participant B language').select_option('es')
        if 'ai' in TAG:
            boxes = pg.locator('.consent-group').nth(4).locator('input[type=checkbox]')
            for i in range(await boxes.count()):
                if await boxes.nth(i).is_enabled(): await boxes.nth(i).check()
        await pg.screenshot(path=f'{OUT}/{TAG}-0-consent.png', full_page=True)
        await pg.get_by_role('button', name=re.compile(r'Mouse \/ touch')).click(); await pg.wait_for_timeout(800)
        box = await pg.locator('.frame').bounding_box()
        async def wiggle(n, high=False):
            for i in range(n):
                t = i * 0.04
                y = (0.22 + 0.08 * math.sin(t * 1.6)) if high else (0.45 + 0.25 * math.sin(t * 1.3))
                await pg.mouse.move(box['x'] + box['width'] * (0.5 - 0.3 * abs(math.cos(t))), box['y'] + box['height'] * y); await pg.wait_for_timeout(12)
        await wiggle(100)
        # Express: A (中文) answers
        if 'ai' in TAG:
            await pg.locator('.composer.A textarea').fill('我最想念外婆家的院子，夏天有很多花。'); await pg.locator('.composer.A textarea').press('Enter')
        else:
            await pg.locator('.composer.A .phrases summary').click(); await pg.locator('.composer.A .phrase', has_text='妈妈做的饭').click()
            await pg.locator('.composer.A').get_by_role('button', name='Send', exact=True).click()
        await pg.wait_for_timeout(1200 if 'ai' in TAG else 400)
        print('flow:', one(await pg.locator('.convbar .flow').inner_text()), '|', await pg.locator('.flow-next').inner_text(), '| mode:', one(await pg.locator('.mode-badge').inner_text()))
        print('1 Understand (B reads es):', one(await pg.locator('.bridge-side.B').inner_text())[:200])
        await pg.screenshot(path=f'{OUT}/{TAG}-1-bridge.png')
        # Understand + Respond: B (Español)
        await pg.locator('.bridge-side.B').get_by_role('button', name='I follow').click()
        await pg.locator('.bridge-side.B').get_by_role('button', name=re.compile('respond')).click()
        if 'ai' in TAG:
            await pg.locator('.composer.B textarea').fill('A mí también me encantan los jardines de mi abuela.'); await pg.locator('.composer.B textarea').press('Enter')
        else:
            await pg.locator('.composer.B .phrases summary').click(); await pg.locator('.composer.B .phrase', has_text='Yo también').click()
            await pg.locator('.composer.B').get_by_role('button', name='Send', exact=True).click()
        await pg.wait_for_timeout(1200 if 'ai' in TAG else 400)
        print('2 A reads zh:', one(await pg.locator('.bridge-side.A').inner_text())[:200])
        print('2 B speaker side:', one(await pg.locator('.bridge-side.B').inner_text())[:200])
        await pg.screenshot(path=f'{OUT}/{TAG}-2-reply.png')
        # Send & Catch: B sends her words as a gift → A catches, transforms, answers, sends back → B places
        await pg.locator('.bridge-side.B').get_by_role('button', name=re.compile('send these words')).click()
        await pg.wait_for_selector('.composer.A .gift-line.incoming button')
        await wiggle(40)
        await pg.screenshot(path=f'{OUT}/{TAG}-3-gift-flying.png')
        await pg.locator('.composer.A').get_by_role('button', name='Catch').click()
        await pg.locator('.composer.A').get_by_role('button', name='+ my texture').click()
        await pg.locator('.composer.A .gift-reply input').fill('谢谢你的分享。'); await pg.locator('.composer.A .gift-reply input').press('Enter')
        await pg.wait_for_timeout(500)
        print('3 gift:', json.dumps(await pg.evaluate("window.__babel.gifts.snapshot().map(g => [g.state, g.holder, g.originMessageId, g.captions.map(c => c.by + ':' + c.text)])"), ensure_ascii=False))
        print('3 B reads:', one(await pg.locator('.bridge-side.B').inner_text())[:160])
        await pg.locator('.composer.A').get_by_role('button', name=re.compile('send back')).click()
        await pg.wait_for_selector('.composer.B .gift-line.incoming button')
        await pg.locator('.composer.B').get_by_role('button', name='Catch').click()
        await pg.locator('.composer.B').get_by_role('button', name='place').click()
        # Co-create: Sanctuary
        await pg.get_by_role('button', name='Sanctuary').click()
        await wiggle(420, high=True)
        print('4 sanctuary:', json.dumps(await pg.evaluate('window.__babel.sanctuaryStats()'))[:200])
        await pg.screenshot(path=f'{OUT}/{TAG}-4-sanctuary.png')
        print('flow late:', await pg.locator('.flow-next').inner_text())
        # Presentation check
        await pg.get_by_role('button', name='Present').click(); await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'{OUT}/{TAG}-5-present.png')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        # Reflect
        await pg.get_by_role('button', name='End session').click()
        try: await pg.wait_for_selector('.result', timeout=20000)
        except Exception: print('NO RESULT', errs); await pg.screenshot(path=f'{OUT}/{TAG}-fail.png'); raise
        await pg.wait_for_timeout(800)
        print('5 result h2:', await pg.locator('.result h2').all_inner_texts())
        print('5 transcript:', one(await pg.locator('.transcript').inner_text())[:600])
        await pg.screenshot(path=f'{OUT}/{TAG}-6-result.png')
        await pg.locator('.evidence').scroll_into_view_if_needed(); await pg.locator('.evidence').screenshot(path=f'{OUT}/{TAG}-7-evidence.png')
        async with pg.expect_download() as d: await pg.get_by_role('button', name=re.compile('Export report')).first.click()
        dl = await d.value; path = f'{OUT}/{TAG}-report.json'; await dl.save_as(path)
        r = json.load(open(path)); print('report:', {k: r.get(k) for k in ['responses', 'selfReports', 'translationSources']})
        e = r.get('evidence', {}); print('evidence body:', json.dumps(e.get('body', {}).get('session'))[:300]); print('evidence lang:', json.dumps(e.get('language', {}).get('messages'), ensure_ascii=False)[:400], '| topics', e.get('language', {}).get('topics'), '| cats', e.get('language', {}).get('sanctuaryCategories'))
        async with pg.expect_download() as d: await pg.get_by_role('button', name=re.compile('counts only')).click()
        dl = await d.value; path2 = f'{OUT}/{TAG}-report-counts.json'; await dl.save_as(path2)
        raw = open(path2).read(); rc = json.loads(raw)
        leaked = [m['text'] for m in r['transcript'] if m['text'] and m['text'] in raw]
        print('counts-only leaks text:', leaked, '| transcript texts empty:', all(m['text'] == '' for m in rc['transcript']))
        async with pg.expect_download() as d: await pg.get_by_role('button', name=re.compile('Download Story Film')).click()
        await (await d.value).save_as(f'{OUT}/{TAG}-film.webm')
        async with pg.expect_download() as d: await pg.get_by_role('button', name=re.compile('Download PNG')).click()
        await (await d.value).save_as(f'{OUT}/{TAG}-art.png')
        # New session → consent, then start again (reset path)
        await pg.get_by_role('button', name='New session').click(); await pg.wait_for_timeout(500)
        print('flow before end n/a')
        print('6 back at consent:', await pg.locator('.consent').count())
        await pg.get_by_role('button', name=re.compile(r'Mouse \/ touch')).click(); await pg.wait_for_timeout(600)
        print('6 fresh bridge:', one(await pg.locator('.bridge').inner_text())[:120], '| messages', await pg.evaluate('window.__babel ? 1 : 0'))
        await b.close()
    print('errors', errs)
asyncio.run(main())
