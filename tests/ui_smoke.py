from playwright.sync_api import sync_playwright

from pathlib import Path
ROOT = Path('/mnt/data/classroom-pulse-starter')
css = (ROOT / 'style.css').read_text()
html = (ROOT / 'index.html').read_text()
core = (ROOT / 'core.mjs').read_text().replace('export const ', 'const ').replace('export function ', 'function ')
app = (ROOT / 'app.mjs').read_text().replace("import { CLASSROOMS, createDemoStudents, filterStudents, summarizeStudents, updateLocks, validateNotice, sanitizeForDisplay } from './core.mjs';", '')
content=html.replace('<link rel="stylesheet" href="./style.css" />','<style>'+css+'</style>').replace('<script type="module" src="./app.mjs"></script>','<script>'+core+'\n'+app+'</script>')

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1050}, device_scale_factor=1)
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(content, wait_until='load')
    page.screenshot(path='/mnt/data/classroom-pulse-starter/preview_desktop.png', full_page=True)
    assert page.locator('#statTotal').inner_text() == '20명'
    assert page.locator('.student-card').count() == 20
    page.locator('#studentSearch').fill('학생 01')
    assert page.locator('.student-card').count() == 1
    page.locator('#studentSearch').fill('')
    page.locator('[data-filter="offline"]').click()
    assert page.locator('.student-card').count() == 2
    page.locator('[data-filter="all"]').click()
    page.locator('#lockAll').click()
    assert page.locator('#confirmDialog').is_visible()
    page.locator('#confirmAction').click()
    assert page.locator('.flag.locked').count() == 20
    page.locator('#lockAll').click()
    page.locator('#confirmAction').click()
    assert page.locator('.flag.locked').count() == 0
    page.locator('#openNotice').click()
    page.locator('#noticeText').fill('수업을 마무리합니다')
    page.locator('#noticeForm [type="submit"]').click()
    assert page.locator('.toast').count() > 0
    page.locator('[data-class="club"]').click()
    assert page.locator('.student-card').count() == 8
    page.locator('[data-class="main"]').click()
    assert page.locator('.student-card').count() == 20
    assert errors == [],errors
    print('PASS: desktop render, search, filter, lock/unlock, notice, classroom switch; JS pageerrors=0')
    mobile = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
    mobile.set_content(content, wait_until='load')
    mobile.screenshot(path='/mnt/data/classroom-pulse-starter/preview_mobile.png',full_page=True)
    assert mobile.locator('.student-card').count() == 20
    print('PASS: mobile viewport and 20 mock cards')
    browser.close()
