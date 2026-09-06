import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('../../', import.meta.url);
const html = readFileSync(new URL('public/live.html', root), 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const shared = readFileSync(new URL('public/static/css/shared.css', root), 'utf8');
const site = readFileSync(new URL('public/static/css/site.css', root), 'utf8');
const font = readFileSync(new URL('public/fonts/inter-latin.woff2', root)).toString('base64');
const build = await Bun.build({ entrypoints: [new URL('src/live/odometer.ts', root).pathname], target: 'browser' });
if (!build.success) throw new Error('Odometer build failed');
const source = await build.outputs[0].text();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
try {
    const page = await browser.newPage({ locale: "de-DE", deviceScaleFactor: 1.25 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent(`<html class="live-host"><style>${shared}\n${site}\n${css}\n@font-face { font-family: CounterTest; src: url(data:font/woff2;base64,${font}); } #parent { margin: 20px; } #live-viewers { font-family: CounterTest; } #reference { transition-property: none; position: absolute; visibility: hidden; font: inherit; font-variant-numeric: tabular-nums; line-height: 1.25; white-space: nowrap; }</style><div id="parent"><span id="live-viewers"><svg viewBox="0 0 24 24"><circle cx="12" cy="7.2" r="4.2"/><path d="M12 13.4c-4.8 0-8 2.6-8 6.6h16c0-4-3.2-6.6-8-6.6z"/></svg><span id="live-viewers-count"></span><span id="reference"></span></span><span id="header-parent" hidden><span id="live-viewers-header-count"></span></span></div></html>`);
    await page.evaluate(async source => {
        const module = await import(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
        const counter = document.getElementById('live-viewers-count');
        window.render = value => module.renderOdometer(counter, value);
        window.clear = () => module.clearOdometer(counter);
        window.renderHeader = value => module.renderOdometer(document.getElementById('live-viewers-header-count'), value);
        window.assertSettled = value => {
            const text = String(value);
            const reference = document.getElementById('reference');
            reference.textContent = text;
            if (counter.textContent !== text) throw new Error(`Wrong count: expected ${text}, got ${counter.textContent}`);
            if (counter.children.length) throw new Error(`Temporary animation markup persisted for ${text}`);
            if (counter.getAnimations({subtree:true}).length) throw new Error(`Animation persisted for ${text}: ${JSON.stringify(counter.getAnimations({subtree:true}).map(a => ({type:a.constructor.name, property:a.transitionProperty, target:a.effect.target.className, frames:a.effect.getKeyframes()})))}`);
            const range = document.createRange();
            range.selectNodeContents(counter);
            const actualRect = range.getBoundingClientRect();
            range.selectNodeContents(reference);
            const referenceRect = range.getBoundingClientRect();
            if (Math.abs(actualRect.width - referenceRect.width) > .1 || Math.abs(actualRect.height - referenceRect.height) > .1) throw new Error(`Text dimensions differ from normal text for ${text}: ${actualRect.width}x${actualRect.height} versus ${referenceRect.width}x${referenceRect.height}`);
        };
    }, source);
    await page.evaluate(() => document.fonts.ready);
    for (const value of [16, 89, 1000]) {
        await page.evaluate(value => { window.clear(); window.render(value); window.assertSettled(value); }, value);
        const counter = page.locator('#live-viewers-count');
        const rendered = await counter.screenshot();
        await counter.evaluate((el, value) => { el.textContent = String(value); }, value);
        const reference = await counter.screenshot();
        if (!rendered.equals(reference)) throw new Error(`Startup differs from normal text for ${value}`);
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const fontSize of [11, 13, 13.33, 16, 24]) {
        for (const scale of [0.8, 1, 1.25]) {
            await page.evaluate(({fontSize, scale}) => {
                document.getElementById('parent').style.transform = `scale(${scale})`;
                document.getElementById('live-viewers').style.fontSize = `${fontSize}px`;
            }, {fontSize, scale});
            for (const value of [0, 9, 10, 16, 99, 100, 999, 1000, 1001, 987654321, 16]) {
                await page.evaluate(value => { window.render(value); window.assertSettled(value); }, value);
            }
        }
    }
    await page.evaluate(() => {
        window.render(89);
        document.getElementById('live-viewers').style.fontSize = '19.7px';
        window.assertSettled(89);
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
        const parent = document.getElementById('parent');
        parent.style.display = 'none';
        window.render(16);
        parent.style.display = '';
        window.assertSettled(16);
        window.clear();
        parent.style.display = 'none';
        window.render(9876);
        parent.style.display = '';
        window.assertSettled(9876);
        window.renderHeader(16);
        window.renderHeader(89);
        const header = document.getElementById('live-viewers-header-count');
        document.getElementById("header-parent").hidden = false;
        if (header.textContent !== '89' || header.children.length) throw new Error('Hidden header startup failed');
    });
    await page.evaluate(() => {
        document.getElementById('parent').style.transform = 'none';
        document.getElementById('live-viewers').style.fontSize = '13px';
    });
    for (const [before, after] of [[16, 19], [9876, 9000], [10, 100], [1000, 100]]) {
        const animated = await page.evaluate(({before, after}) => {
            window.clear();
            window.render(before);
            window.render(after);
            const counter = document.getElementById('live-viewers-count');
            for (const animation of counter.getAnimations({subtree:true})) {
                animation.pause();
                animation.currentTime = 349.999;
            }
            return [...counter.querySelectorAll('.odo-place > .odo-digit:first-child')].filter(el => el.textContent).map(el => {
                const range = document.createRange();
                range.selectNodeContents(el);
                return range.getBoundingClientRect().x;
            });
        }, {before, after});
        const animatedPixels = await page.locator('#live-viewers-count').screenshot({path: '/tmp/itzon-animated-end.png'});
        await page.evaluate(() => {
            for (const animation of document.getElementById('live-viewers-count').getAnimations({subtree:true})) animation.finish();
        });
        const settledPixels = await page.locator('#live-viewers-count').screenshot({path: '/tmp/itzon-settled-end.png'});
        if (!animatedPixels.equals(settledPixels)) throw new Error(`Digit rendering changes at settlement: ${before} to ${after}`);
        const settled = await page.evaluate(() => {
            const text = document.getElementById('live-viewers-count').firstChild;
            return Array.from(text.textContent, (_, index) => {
                const range = document.createRange();
                range.setStart(text, index);
                range.setEnd(text, index + 1);
                return range.getBoundingClientRect().x;
            });
        });
        const delta = settled.map((x, index) => Math.abs(x - animated[index]));
        if (delta.some(x => x > .1)) throw new Error(`Horizontal jump ${before} to ${after}: animated ${animated}; settled ${settled}`);
    }
    for (const [before, after] of [[10, 100], [100, 1000], [1000, 100], [100, 10], [9, 10], [99, 100], [999, 1000], [1000, 999], [1, 9000], [9000, 1]]) {
        await page.evaluate(({before, after}) => {
            window.clear();
            window.render(before);
            window.render(after);
            const counter = document.getElementById('live-viewers-count');
            const animations = counter.getAnimations({subtree:true});
            if (!animations.some(a => a.effect.target.classList.contains('odo-digit'))) throw new Error(`No digit animation for ${before} to ${after}`);
            if (!animations.some(a => a.effect.target.classList.contains('odo-place'))) throw new Error(`No width animation for ${before} to ${after}`);
        }, {before, after});
        await page.waitForTimeout(450);
        await page.evaluate(after => window.assertSettled(after), after);
    }
    await page.evaluate(() => {
        window.clear();
        window.render(9000);
        if (document.getElementById('live-viewers-count').textContent !== '9000') throw new Error('Locale grouping was applied');
    });
    await page.evaluate(() => window.render(1234));
    await page.waitForTimeout(80);
    await page.evaluate(() => window.render(9876));
    await page.waitForTimeout(80);
    await page.evaluate(() => window.render(5678));
    await page.waitForTimeout(450);
    await page.evaluate(() => window.assertSettled(5678));
    await page.evaluate(() => {
        window.render(9876);
        for (const animation of document.getElementById('live-viewers-count').getAnimations({subtree:true})) animation.pause();
        window.render(1234);
    });
    await page.waitForTimeout(450);
    await page.evaluate(() => window.assertSettled(1234));
    await page.evaluate(() => window.render(9876));
    await page.waitForTimeout(80);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(50);
    await page.evaluate(() => window.assertSettled(9876));
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => {
        window.render(1234);
        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        window.assertSettled(1234);
        delete document.hidden;
    });
    await page.evaluate(() => { window.render(9876); window.clear(); });
    await page.waitForTimeout(450);
    await page.evaluate(() => {
        if (document.getElementById('live-viewers-count').textContent !== '') throw new Error('Old animation restored a cleared counter');
        window.render(16);
        window.assertSettled(16);
        document.getElementById('parent').style.transform = 'none';
        document.getElementById('live-viewers').style.fontSize = '13px';
    });
    await page.locator('#live-viewers').screenshot({ path: '/tmp/itzon-odometer-fixed-startup.png' });
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Passed: startup pixels match normal text; final animation frame matches settled pixels and horizontal positions at 1.25x display scaling; 165 value/font/scale combinations; animated growth and shrinkage; ungrouped numbers in German locale; resize; hidden startup and updates; independent header counter; rapid and paused animation replacement; reduced motion; tab hiding; reset during animation.');
} finally {
    await browser.close();
}
