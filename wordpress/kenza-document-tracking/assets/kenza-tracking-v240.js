(() => {
  const companyName = String(window.KenzaTrackingConfig?.companyName || 'Your Company');
  const esc = (v='') => String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const fmtDate = v => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  };
  const normStatus = v => String(v || '').trim().toLowerCase();

  const activeStages = d => (d.document_stages || []).filter(s => {
    const st = normStatus(s.status);
    return st !== 'not required' && st !== 'cancelled';
  });

  const isCompletedStage = s => normStatus(s.status) === 'completed';

  const docProgress = d => {
    const s = activeStages(d);
    if (!s.length) {
      return normStatus(d.document_status) === 'completed' ? 100 : 0;
    }
    return Math.round(s.filter(isCompletedStage).length / s.length * 100);
  };

  const overallProgress = c => {
    const docs = c.documents || [];
    const stages = docs.flatMap(activeStages);

    // Primary rule: completed attestation stages / all applicable stages.
    if (stages.length) {
      return Math.round(stages.filter(isCompletedStage).length / stages.length * 100);
    }

    // Fallback when stage data is unavailable: completed documents / all documents.
    if (docs.length) {
      const completeDocs = docs.filter(d =>
        normStatus(d.document_status) === 'completed' || docProgress(d) === 100
      ).length;
      return Math.round(completeDocs / docs.length * 100);
    }

    // Final fallback for legacy cases without document/stage rows.
    return ['completed','ready for delivery','delivered'].includes(normStatus(c.overall_status)) ? 100 : 0;
  };

  const journey = ['Received','Under Process','Completed','Ready for Delivery','Delivered'];
  const journeyIndex = s => s === 'Waiting' ? 1 : Math.max(0, journey.indexOf(s));

  const statusLabel = s => {
    if (s === 'Under Process') return 'In progress';
    if (s === 'Ready for Delivery') return 'Ready';
    return s || 'Received';
  };

  function skeleton() {
    return `<div class="kt-v2-skeleton">
      <div class="kt-sk-top"><i></i><span></span></div>
      <div class="kt-sk-line"></div>
      <div class="kt-sk-summary"><i></i><i></i></div>
      <div class="kt-sk-doc"></div><div class="kt-sk-doc"></div><div class="kt-sk-doc"></div>
    </div>`;
  }

  function empty(message='Tracking reference not found') {
    return `<div class="kt-v2-empty">
      <div class="kt-empty-mark">!</div>
      <h3>${esc(message)}</h3>
      <p>Please check the tracking number and try again.</p>
    </div>`;
  }

  function stageRows(d) {
    const stages = activeStages(d);
    if (!stages.length) return `<div class="kt-stage-empty">Stage details are being prepared.</div>`;
    return stages.map((s,i) => `
      <div class="kt-stage-row ${isCompletedStage(s) ? 'is-done' : normStatus(s.status) === 'processing' ? 'is-active' : ''}">
        <span class="kt-stage-dot">${isCompletedStage(s) ? '✓' : i+1}</span>
        <div class="kt-stage-text">
          <strong>${esc(s.stage_name)}</strong>
          <small>${esc(statusLabel(s.status))}</small>
        </div>
      </div>`).join('');
  }

  function resultHtml(c) {
    const docs = c.documents || [];
    const progress = overallProgress(c);
    const status = c.overall_status || 'Received';
    const current = journeyIndex(status);
    const completed = docs.filter(d => docProgress(d) === 100 || normStatus(d.document_status) === 'completed').length;

    const journeyHtml = journey.map((s,i) => `
      <div class="kt3-step ${i<current?'is-done':i===current?'is-current':''}">
        <span>${i<current?'✓':i+1}</span>
        <div><strong>${esc(s)}</strong>${i===current?'<small>Current stage</small>':''}</div>
      </div>`).join('');

    const docsHtml = docs.map((d,di) => {
      const pct = docProgress(d);
      const stages = activeStages(d);
      const done = stages.filter(s => s.status === 'Completed').length;
      return `<article class="kt3-doc">
        <button type="button" class="kt3-doc-toggle" data-kt-doc>
          <span class="kt3-doc-no">${String(di+1).padStart(2,'0')}</span>
          <span class="kt3-doc-title"><strong>${esc(d.document_name || `Document ${di+1}`)}</strong><small>${stages.length ? `${done}/${stages.length} stages completed` : 'Stage details pending'}</small></span>
          <span class="kt3-doc-meter"><i><b style="width:${pct}%"></b></i><em>${pct}%</em></span>
          <span class="kt3-doc-state ${pct===100?'is-complete':pct>0?'is-active':''}">${pct===100?'Completed':pct>0?'Processing':'Received'}</span>
          <span class="kt3-plus">+</span>
        </button>
        <div class="kt3-stages">${stageRows(d)}</div>
      </article>`;
    }).join('');

    const notice = ['Ready for Delivery','Delivered'].includes(status) ? `
      <div class="kt3-notice"><span>✓</span><div><strong>${status==='Delivered'?'Delivery completed':'Ready for delivery'}</strong><small>${status==='Delivered'?'Your document journey is complete.':`Your documents are ready. Please contact ${esc(companyName)} for collection or delivery.`}</small></div></div>` : '';

    return `<section class="kt3-result kt-enter" data-kt-result data-reference="${esc(c.tracking_reference)}">
      <div class="kt3-top">
        <div class="kt3-person">
          <small>TRACKING REFERENCE</small>
          <div class="kt3-ref"><h3>#${esc(c.tracking_reference)}</h3><button type="button" data-kt-copy>Copy</button></div>
          <h2>${esc(c.customer_name || 'Customer')}</h2>
        </div>
        <div class="kt3-overall" role="group" aria-label="Overall progress">
          <div class="kt3-percent" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}" style="--kt-progress:${Math.max(0,Math.min(100,progress))}"><strong>${progress}</strong><span>%</span></div>
          <div><small>OVERALL PROGRESS</small><strong>${esc(statusLabel(status))}</strong></div>
        </div>
      </div>

      ${notice}

      <div class="kt3-layout">
        <aside class="kt3-sidebar">
          <div class="kt3-side-title"><small>CASE JOURNEY</small><strong>Progress</strong></div>
          <div class="kt3-steps">${journeyHtml}</div>
          <div class="kt3-facts">
            <div><small>Submitted</small><strong>${fmtDate(c.submission_date)}</strong></div>
            <div><small>Documents completed</small><strong>${completed} / ${docs.length}</strong></div>
          </div>
        </aside>

        <main class="kt3-main">
          <div class="kt3-main-head">
            <div><small>DOCUMENT STATUS</small><h3>Your documents</h3><p>Open a document to see each attestation stage.</p></div>
            <span>${docs.length}</span>
          </div>
          <div class="kt3-docs">${docsHtml || '<div class="kt-v2-no-docs">Document details are being prepared.</div>'}</div>
        </main>
      </div>

      <footer class="kt3-footer">
        <div><strong>Need help?</strong><span>Quote tracking #${esc(c.tracking_reference)} when contacting ${esc(companyName)}.</span></div>
        <button type="button" class="kt-btn kt-primary" data-kt-print>Print / Save PDF</button>
      </footer>
    </section>`;
  }

  async function lookup(root, reference, token='') {
    const output = root.querySelector('[data-kt-output]');
    const submit = root.querySelector('[data-kt-submit]');
    const input = root.querySelector('[data-kt-input]');
    reference = String(reference || '').trim();
    if (!reference&&!token) return;
    output.innerHTML = skeleton();
    submit.disabled = true;
    submit.textContent = 'Checking...';
    try {
      const body = new URLSearchParams({action:'kenza_tracking_lookup', nonce:KenzaTrackingConfig.nonce, reference, token});
      const r = await fetch(KenzaTrackingConfig.ajaxUrl, {
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body,
        credentials:'same-origin'
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.data?.message || 'Unable to track.');
      const list = j?.data?.cases || [];
      root._ktMatches=list;
      output.innerHTML = list.length>1?`<section class="kt-matches"><h3>${list.length} matching cases</h3><p>Select a case to see its progress.</p>${list.map((c,i)=>`<button type="button" class="kt-match" data-kt-match="${i}"><strong>#${esc(c.tracking_reference)}</strong><span>${esc(c.customer_name)}</span><b>${esc(c.overall_status)}</b></button>`).join('')}</section>`:list.length?resultHtml(list[0]):empty();
      if (list.length===1) {
        const u = new URL(window.location.href);
        u.searchParams.set('ref', list[0].tracking_reference);
        history.replaceState({},'',u);
      }
    } catch (e) {
      output.innerHTML = empty(e.message || 'Unable to track.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Track';
    }
  }

  function printResult(root) {
    const result = root.querySelector('[data-kt-result]');
    if (!result) return;

    const reference = result.dataset.reference || '';
    const customer = result.querySelector('.kt3-person h2')?.textContent?.trim() || 'Customer';
    const status = result.querySelector('.kt3-overall > div:last-child strong')?.textContent?.trim() || '';
    const progress = result.querySelector('.kt3-percent strong')?.textContent?.trim() || '0';
    const submitted = result.querySelector('.kt3-facts > div:first-child strong')?.textContent?.trim() || '—';
    const docsCompleted = result.querySelector('.kt3-facts > div:nth-child(2) strong')?.textContent?.trim() || '—';

    const docRows = [...result.querySelectorAll('.kt3-doc')].map((doc, index) => {
      const title = doc.querySelector('.kt3-doc-title strong')?.textContent?.trim() || `Document ${index + 1}`;
      const pct = doc.querySelector('.kt3-doc-meter em')?.textContent?.trim() || '0%';
      const state = doc.querySelector('.kt3-doc-state')?.textContent?.trim() || '';
      const stages = [...doc.querySelectorAll('.kt-stage-row')].map(s => {
        const name = s.querySelector('.kt-stage-text strong')?.textContent?.trim() || '';
        const st = s.querySelector('.kt-stage-text small')?.textContent?.trim() || '';
        return `<div class="kt-print-stage"><span>${esc(name)}</span><b>${esc(st)}</b></div>`;
      }).join('');
      return `<section class="kt-print-doc">
        <div class="kt-print-doc-head">
          <span class="kt-print-doc-no">${String(index + 1).padStart(2,'0')}</span>
          <div><strong>${esc(title)}</strong><small>${esc(state)}</small></div>
          <b>${esc(pct)}</b>
        </div>
        ${stages ? `<div class="kt-print-stages">${stages}</div>` : ''}
      </section>`;
    }).join('');

    document.getElementById('kenza-wp-print-root')?.remove();

    const host = document.createElement('div');
    host.id = 'kenza-wp-print-root';
    host.innerHTML = `
      <div class="kt-print-sheet">
        <header class="kt-print-header">
          <div>
            <span>${esc(companyName.toUpperCase())}</span>
            <h1>Document Tracking Report</h1>
          </div>
          <div class="kt-print-status"><small>STATUS</small><strong>${esc(status)}</strong></div>
        </header>

        <section class="kt-print-identity">
          <div><small>TRACKING REFERENCE</small><strong>#${esc(reference)}</strong></div>
          <div><small>CUSTOMER</small><strong>${esc(customer)}</strong></div>
          <div><small>OVERALL PROGRESS</small><strong>${esc(progress)}%</strong></div>
        </section>

        <section class="kt-print-facts">
          <div><small>Submitted</small><strong>${esc(submitted)}</strong></div>
          <div><small>Documents Completed</small><strong>${esc(docsCompleted)}</strong></div>
        </section>

        <div class="kt-print-section-title">
          <span>DOCUMENT STATUS</span>
          <h2>Your Documents</h2>
        </div>

        <div class="kt-print-docs">${docRows}</div>

        <footer class="kt-print-footer">
          <span>Tracking #${esc(reference)}</span>
          <span>Generated from ${esc(companyName)} document tracking</span>
        </footer>
      </div>`;

    document.body.appendChild(host);
    document.body.classList.add('kenza-wp-printing');

    let cleaned = false;
    const clean = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('kenza-wp-printing');
      host.remove();
      window.removeEventListener('afterprint', clean);
    };

    window.addEventListener('afterprint', clean, { once: true });

    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print();
      setTimeout(clean, 8000);
    }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-kenza-tracker]').forEach(root => {
      const form = root.querySelector('[data-kt-form]');
      const input = root.querySelector('[data-kt-input]');
      form.addEventListener('submit', e => { e.preventDefault(); lookup(root,input.value); });

      root.addEventListener('click', e => {
        const match=e.target.closest('[data-kt-match]');
        if(match){const c=root._ktMatches?.[Number(match.dataset.ktMatch)];if(c){root.querySelector('[data-kt-output]').innerHTML=`<button type="button" class="kt-btn" data-kt-back>← All matching cases</button>`+resultHtml(c)}return;}
        if(e.target.closest('[data-kt-back]')){lookup(root,input.value);return;}
        const doc = e.target.closest('[data-kt-doc]');
        if (doc) doc.closest('.kt3-doc').classList.toggle('is-open');

        const copy = e.target.closest('[data-kt-copy]');
        if (copy) {
          const ref = root.querySelector('[data-kt-result]')?.dataset.reference || '';
          navigator.clipboard?.writeText(ref);
          const old = copy.textContent;
          copy.textContent = 'Copied';
          setTimeout(()=>copy.textContent=old,1000);
        }
        if (e.target.closest('[data-kt-print]')) printResult(root);
      });

      const params=new URLSearchParams(location.search),ref=params.get('ref'),token=params.get('token');
      if(ref||token){input.value=ref||'';lookup(root,ref||'',token||'');}
    });
  });
})();
