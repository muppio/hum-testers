(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Release rules. Everything down to `rules` is pure, so tests/manifest-states.test.js
  // can load this file in Node and exercise each manifest state without a browser.
  // ---------------------------------------------------------------------------
  const PLATFORMS = ['macos', 'windows'];
  const SPEECH_MODEL_SIZE = 'about 670 MB';

  function safeHttps(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }

  const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const hasVersion = (entry) => typeof entry.version === 'string' && entry.version.trim() !== '';
  const hasChecksum = (entry) => typeof entry.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(entry.sha256);

  // Verified public release. Every gate must be literally true; Mac also needs notarization.
  function isPublicRelease(platform, release) {
    return isObject(release) && release.public === true && release.platform_validated === true &&
      release.signature_verified === true && (platform !== 'macos' || release.notarized === true) &&
      hasVersion(release) && Boolean(safeHttps(release.download_url)) && hasChecksum(release);
  }

  // Unsigned pre-release: a separate, weaker state with its own label and first-run steps.
  // It is never shown as a verified release and does not read or imply the gates above.
  function isPrerelease(entry) {
    return isObject(entry) && hasVersion(entry) && Boolean(safeHttps(entry.download_url)) && hasChecksum(entry);
  }

  function platformState(platform, info) {
    if (isObject(info) && isPublicRelease(platform, info.release)) return { kind: 'release', entry: info.release };
    if (isObject(info) && isPrerelease(info.prerelease)) return { kind: 'prerelease', entry: info.prerelease };
    return { kind: 'none', entry: null };
  }

  function fileNameOf(entry) {
    const bad = /[\\/:*?"<>|\u0000-\u001f\u007f‪-‮⁦-⁩]/;
    const named = typeof entry.file_name === 'string' ? entry.file_name.trim() : '';
    if (named && named.length <= 120 && !bad.test(named)) return named;
    try {
      const last = decodeURIComponent(new URL(entry.download_url).pathname.split('/').pop() || '');
      return last && last.length <= 120 && !bad.test(last) ? last : '';
    } catch { return ''; }
  }

  function formatBytes(bytes) {
    if (!Number.isSafeInteger(bytes) || bytes <= 0) return '';
    const exact = `${bytes.toLocaleString('en-US')} bytes`;
    if (bytes < 1024) return exact;
    const megabytes = bytes / 1048576;
    const rounded = megabytes < 1 ? `${Math.max(1, Math.round(bytes / 1024))} KB` :
      megabytes < 1024 ? `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB` :
        `${(megabytes / 1024).toFixed(2)} GB`;
    return `${rounded} (${exact})`;
  }

  const SIGNING = {
    windows: 'Not code-signed. Windows SmartScreen will warn before it runs.',
    macos: 'Not signed with an Apple Developer ID and not notarized by Apple. macOS will block the first open.'
  };

  // First-run steps for an unsigned build. Windows depends on the file: the portable ZIP is a
  // whole folder, anything else is treated as the Setup program. The Mac build is a ZIP.
  function firstRunSteps(platform, fileName) {
    if (platform === 'windows') {
      const zipped = /\.zip$/i.test(fileName || '');
      const verify = 'Optional: check the download first. In PowerShell, run Get-FileHash on the file. The SHA-256 it shows should match the one above (letter case doesn’t matter).';
      const smartScreen = 'Windows SmartScreen will say “Windows protected your PC”, because this build is not code-signed. Select “More info”, then “Run anyway”.';
      const ready = `Hum will say the speech model is not downloaded. Choose Download (${SPEECH_MODEL_SIZE}). Hum does not use the microphone until you start.`;
      return zipped ? [
        verify,
        'Unzip the whole download into a folder you will keep (in File Explorer: right-click it, then Extract All). Hum needs every file in it, not only Hum.exe.',
        'Open the Hum folder and double-click Hum.exe.',
        smartScreen,
        ready
      ] : [
        verify,
        'Open the downloaded Setup file.',
        smartScreen,
        `Finish Setup and open Hum. ${ready}`
      ];
    }
    return [
      'Optional: check the download first. In Terminal, run shasum -a 256 on the file. The result should match the SHA-256 above.',
      'Unzip the download and move Hum to your Applications folder.',
      'Open Hum once. macOS will refuse, because this build is not signed with an Apple Developer ID and is not notarized. Close that message.',
      'Open System Settings, go to Privacy & Security, scroll to Security, and choose “Open Anyway” next to Hum. It appears after your first try. Confirm when macOS asks.',
      `Open Hum again. It will tell you what is still missing (speech model, microphone, Accessibility) and offer each fix. The speech model is ${SPEECH_MODEL_SIZE}.`
    ];
  }

  // Everything one platform panel needs to show, for any of the three states.
  function panelView(platform, info) {
    const { kind, entry } = platformState(platform, info);
    const name = isObject(info) && typeof info.name === 'string' ? info.name : platform === 'macos' ? 'Mac' : 'Windows';
    const view = {
      kind, name, download: null,
      statusLabel: isObject(info) ? info.status_label : undefined,
      tabLabel: isObject(info) ? info.tab_label : undefined,
      versionLabel: isObject(info) ? info.version_label : undefined
    };
    if (kind === 'none') return view;
    const version = entry.version.trim();
    const fileName = fileNameOf(entry);
    view.download = {
      url: safeHttps(entry.download_url), version, fileName,
      sha256: entry.sha256.toLowerCase(),
      size: formatBytes(entry.size_bytes),
      notesUrl: safeHttps(entry.notes_url)
    };
    if (kind === 'release') {
      view.statusLabel = 'Available now';
      view.tabLabel = 'Available';
      view.versionLabel = `Version ${version}`;
      view.download.label = `Download for ${name}`;
      view.download.ariaLabel = `Download Hum for ${name}, version ${version}`;
    } else {
      view.statusLabel = 'Unsigned pre-release';
      view.tabLabel = 'Pre-release';
      view.versionLabel = `Version ${version} (pre-release)`;
      view.download.label = `Download pre-release for ${name}`;
      view.download.ariaLabel = `Download the unsigned pre-release of Hum for ${name}, version ${version}`;
      view.download.signing = SIGNING[platform];
      view.download.steps = firstRunSteps(platform, fileName);
    }
    return view;
  }

  // Hero line, download introduction and availability answer, always from the manifest, so a
  // download withdrawn from the manifest also disappears from these lines.
  function summary(data) {
    const named = (kind) => PLATFORMS
      .filter((platform) => platformState(platform, data.platforms[platform]).kind === kind)
      .map((platform) => panelView(platform, data.platforms[platform]).name);
    const released = named('release');
    const pre = named('prerelease');
    const waiting = named('none');
    if (!released.length && !pre.length) {
      return {
        hero: 'Mac and Windows, in testing. No download right now.',
        introduction: 'Hum runs on Mac and Windows today, in testing. There is nothing to download here right now.',
        answer: 'Not right now. Hum runs on Mac and Windows in testing, but no download is listed at the moment. When one is, this page will show its version, checksum and signing status.'
      };
    }
    const list = (names) => names.join(' and ');
    const still = waiting.length ? ` ${list(waiting)} is still in preparation.` : '';
    const hero = [
      released.length ? `${list(released)} available` : '',
      pre.length ? `${list(pre)} unsigned pre-release` : '',
      waiting.length ? `${list(waiting)} in preparation` : ''
    ].filter(Boolean).join(' / ');
    if (!released.length) {
      return {
        hero,
        introduction: `An unsigned pre-release is available for ${list(pre)}. It is test software: read the first-run steps below and compare the SHA-256 before you open it.`,
        answer: `Not as a finished release. An unsigned pre-release for ${list(pre)} is linked in the download section above, for people who want to test it.${still} Each download shows its SHA-256 checksum and first-run steps.`
      };
    }
    return {
      hero,
      introduction: pre.length ?
        `Public downloads are available for ${list(released)}, and an unsigned pre-release for ${list(pre)}. Choose your platform below for the release, requirements, and checksum.` :
        `Public downloads are available for ${list(released)}. Choose your platform below for the release, requirements, and checksum.`,
      answer: `Yes. Public releases for ${list(released)} are linked in the download section above.${pre.length ? ` An unsigned pre-release for ${list(pre)} is listed there too, clearly marked.` : ''}${still} Each download includes a SHA-256 checksum and release details.`
    };
  }

  function isManifest(data) {
    return isObject(data) && data.schema_version === 1 && isObject(data.platforms) &&
      isObject(data.platforms.macos) && isObject(data.platforms.windows);
  }

  // The visitor's own system: Windows if the browser says so, otherwise Mac.
  const systemPlatform = (userAgent) => /windows/i.test(userAgent || '') ? 'windows' : 'macos';

  // The tab to open. When exactly one platform offers a download (verified or pre-release), open
  // that one for everyone; otherwise follow the visitor's system.
  function initialPlatform(data, userAgent) {
    const offered = isManifest(data) ?
      PLATFORMS.filter((platform) => platformState(platform, data.platforms[platform]).kind !== 'none') : [];
    return offered.length === 1 ? offered[0] : systemPlatform(userAgent);
  }

  const rules = {
    safeHttps, isPublicRelease, isPrerelease, platformState, fileNameOf, formatBytes,
    firstRunSteps, panelView, summary, isManifest, systemPlatform, initialPlatform
  };

  if (typeof document === 'undefined') {
    if (typeof module === 'object' && module && module.exports) module.exports = rules;
    return;
  }

  // ---------------------------------------------------------------------------
  // Page behaviour.
  // ---------------------------------------------------------------------------
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  let manifest = null;
  let visitorChoseTab = false;
  const feedback = $('#release-feedback');
  const dialog = $('#release-dialog');
  let dialogTrigger = null;

  function selectPlatform(platform, focus = false) {
    if (!PLATFORMS.includes(platform)) return;
    $$('.platform-tab').forEach((tab) => {
      const selected = tab.dataset.platform === platform;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    $$('[data-release-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.releasePanel !== platform;
    });
    feedback.textContent = '';
  }

  $$('.platform-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      visitorChoseTab = true;
      selectPlatform(tab.dataset.platform);
    });
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      visitorChoseTab = true;
      const platform = event.key === 'Home' ? 'macos' : event.key === 'End' ? 'windows' :
        tab.dataset.platform === 'macos' ? 'windows' : 'macos';
      selectPlatform(platform, true);
    });
  });

  function renderPanel(platform, info) {
    const panel = $(`[data-release-panel="${platform}"]`);
    const view = panelView(platform, info);
    const download = view.download;
    const text = (selector, value) => {
      if (typeof value === 'string') $(selector, panel).textContent = value;
    };
    const row = (rowSelector, valueSelector, value) => {
      $(rowSelector, panel).hidden = !value;
      $(valueSelector, panel).textContent = value || '';
    };
    panel.classList.toggle('is-prerelease', view.kind === 'prerelease');
    text('[data-status-label]', view.statusLabel);
    text('[data-release-description]', info.description);
    text('[data-system]', info.system);
    text('[data-architecture]', info.architecture);
    text('[data-version]', view.versionLabel);
    if (typeof view.tabLabel === 'string') $(`#tab-${platform} .tab-status`).textContent = view.tabLabel;
    row('[data-file-row]', '[data-file]', download?.fileName);
    row('[data-size-row]', '[data-size]', download?.size);
    const link = $('[data-download]', panel);
    link.hidden = !download;
    $('[data-unavailable]', panel).hidden = Boolean(download);
    $('[data-checksum-block]', panel).hidden = !download;
    $('[data-checksum]', panel).textContent = download ? download.sha256 : '';
    if (download) {
      link.href = download.url;
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', download.ariaLabel);
      $('[data-download-label]', panel).textContent = download.label;
    } else {
      link.removeAttribute('href');
      link.removeAttribute('aria-label');
    }
    const steps = $('[data-first-run]', panel);
    steps.replaceChildren();
    $('[data-prerelease-block]', panel).hidden = view.kind !== 'prerelease';
    $('[data-prerelease-signing]', panel).textContent = view.kind === 'prerelease' ? download.signing : '';
    if (view.kind === 'prerelease') {
      for (const step of download.steps) {
        const item = document.createElement('li');
        item.textContent = step;
        steps.append(item);
      }
    }
  }

  function renderManifest(data) {
    if (!isManifest(data)) throw new Error('Invalid release manifest');
    manifest = data;
    for (const platform of PLATFORMS) renderPanel(platform, data.platforms[platform]);
    // A tab the visitor already picked stays; otherwise open the one the manifest points to.
    if (!visitorChoseTab) selectPlatform(initialPlatform(data, navigator.userAgent));
    const sourceUrl = data.source?.public === true && safeHttps(data.source.url);
    if (sourceUrl) {
      $('#source-link').href = sourceUrl;
      $('#source-link').hidden = false;
      $('#source-status').hidden = true;
      $('#source-answer').textContent = 'The public repository is linked in The Foundations above. Consult its license and third-party notices before redistributing. Open components and speech models retain their own licenses.';
    }
    const lines = summary(data);
    $('#hero-release-status').textContent = lines.hero;
    $('#download-introduction').textContent = lines.introduction;
    $('#availability-answer').textContent = lines.answer;
  }

  function releaseDetails(platform, trigger) {
    const info = manifest?.platforms?.[platform];
    const fallback = {
      name: platform === 'macos' ? 'Mac' : 'Windows',
      details: 'Release details could not be loaded.',
      checks: ['The download section shows the status as of the last page update. Please reload the page for the latest status.']
    };
    const selected = info || fallback;
    const view = info ? panelView(platform, info) : null;
    $('#release-dialog-title').textContent = `Hum for ${view ? view.name : selected.name}`;
    $('#release-dialog-description').textContent = typeof selected.details === 'string' ? selected.details : '';
    const checks = (Array.isArray(selected.checks) ? selected.checks : []).filter((check) => typeof check === 'string');
    if (view?.kind === 'prerelease') {
      checks.unshift(`This download is an unsigned pre-release, version ${view.download.version}. ${view.download.signing}`);
    }
    const list = $('#release-dialog-checks');
    list.replaceChildren();
    for (const check of checks) {
      const li = document.createElement('li');
      li.textContent = check;
      list.append(li);
    }
    const notesUrl = view?.download?.notesUrl;
    $('#release-notes-link').hidden = !notesUrl;
    if (notesUrl) $('#release-notes-link').href = notesUrl;
    else $('#release-notes-link').removeAttribute('href');
    dialogTrigger = trigger;
    dialog.showModal();
  }

  $$('[data-release-details]').forEach((button) => button.addEventListener('click', () =>
    releaseDetails(button.dataset.releaseDetails, button)));
  $('#close-dialog').addEventListener('click', () => dialog.close());
  $('#dialog-done').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialogTrigger?.focus());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });

  $$('[data-copy-checksum]').forEach((button) => button.addEventListener('click', async () => {
    const platform = button.dataset.copyChecksum;
    const info = manifest?.platforms?.[platform];
    const download = info ? panelView(platform, info).download : null;
    if (!download) return;
    try {
      await navigator.clipboard.writeText(download.sha256);
      feedback.textContent = 'Checksum copied. Compare it with the downloaded file’s SHA-256 value.';
    } catch {
      const code = $('[data-checksum]', button.closest('[data-release-panel]'));
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      feedback.textContent = 'The checksum is selected. Copy it using your usual keyboard shortcut.';
    }
  }));

  $$('a[href="#privacy-answer"]').forEach((link) => link.addEventListener('click', () => {
    $('#privacy-answer').open = true;
  }));

  $('a[href="#handsfree-answer"]').addEventListener('click', () => {
    $('#handsfree-answer').open = true;
  });

  const demoButton = $('#replay-demo');
  const demoText = $('#demo-text');
  const demoPill = $('#voice-pill');
  const phrase = 'Let’s make room for the next great idea.';
  const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
  function showDemoText(text) {
    demoText.replaceChildren(document.createTextNode(text));
    const caret = document.createElement('span');
    caret.className = 'demo-caret';
    caret.setAttribute('aria-hidden', 'true');
    demoText.append(caret);
  }
  demoButton.addEventListener('click', async () => {
    demoButton.disabled = true;
    $('#demo-announce').textContent = 'Playing an illustrative dictation example. No microphone is used.';
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      demoPill.classList.add('is-playing');
      $('#pill-label').textContent = 'A thought in motion…';
      showDemoText('');
      await pause(900);
      demoPill.classList.remove('is-playing');
      demoPill.classList.add('is-processing');
      $('#pill-label').textContent = 'Finding the words…';
      await pause(650);
      for (let length = 1; length <= phrase.length; length++) {
        showDemoText(phrase.slice(0, length));
        await pause(32);
      }
    } else showDemoText(phrase);
    demoPill.classList.remove('is-playing', 'is-processing');
    $('#pill-label').textContent = 'Your voice, written.';
    $('#demo-announce').textContent = `Example complete: ${phrase}`;
    demoButton.disabled = false;
    demoButton.lastChild.textContent = 'Replay demo';
  });

  // Until the manifest arrives (or if it never does), follow the visitor's system.
  selectPlatform(systemPlatform(navigator.userAgent));
  fetch('./releases.json', { cache: 'no-cache' })
    .then((response) => { if (!response.ok) throw new Error('Release status unavailable'); return response.json(); })
    .then(renderManifest)
    .catch(() => {
      feedback.textContent = 'Live release information could not be loaded, so this section shows the status as of the last page update. Please try reloading.';
    });
})();
