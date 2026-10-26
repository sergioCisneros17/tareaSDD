const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const amount = (minor, currency = 'BOB', scale = 2) => minor === null || minor === undefined ? '—' : `${new Intl.NumberFormat('es-BO', { minimumFractionDigits: scale, maximumFractionDigits: scale }).format(Number(minor) / 10 ** scale)} ${currency}`;
const date = value => value ? new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Sin consulta';
const errors = { blocked: 'Consulta bloqueada', rate_limited: 'Límite de consultas', incompatible_page: 'Página no compatible', invalid_data: 'Datos no verificables', variant_absent: 'Variante no encontrada', verification_pending: 'Talla en cm no verificable', product_not_found: 'Producto no encontrado', invalid_product: 'Producto no válido', network_error: 'Fallo de conexión', timeout: 'Tiempo de espera agotado', cancelled: 'Consulta cancelada', interrupted: 'Consulta interrumpida' };
let state = { tracking: [], offers: [], demo: false }; let tab = 'all'; let loading = false; let toastTimer;
async function api(path, body) {
  const response = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'No se pudo completar la operación.');
  return result;
}
function toast(text) { $('#toast').textContent = text; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4000); }
function status(row) {
  if (row.lastAttempt?.status === 'failure') return [errors[row.lastAttempt.error] || 'Consulta fallida', 'fail'];
  if (!row.latest) return [row.work?.state === 'running' ? 'Consultando…' : 'Pendiente de consulta', 'warn'];
  if (row.latest.stock !== 'available') return [row.latest.stock === 'out_of_stock' ? 'Sin stock' : 'Stock desconocido', 'warn'];
  if (row.latest.bobMinor === null) return ['Sin conversión a BOB', 'warn'];
  return ['Disponible en tu talla', ''];
}
function renderRow(row) {
  const data = row.latest; const [label, kind] = status(row);
  const offer = state.offers.find(item => item.id === row.id);
  const min = row.minimum || offer?.minimum;
  const discount = data?.originalPrice ? Math.round((1 - Number(data.price.minorUnits) / Number(data.originalPrice.minorUnits)) * 100) : null;
  return `<tr data-id="${row.id}"><td><div class="product-brand">${escape(row.storeId)} · ${escape(row.marketId.split('/').slice(1).join('/') || 'regional')}</div><a class="product-name" href="${escape(row.url)}" target="_blank" rel="noopener noreferrer">${escape(data?.name || 'Producto pendiente de verificar')} ↗</a><p class="variant-label">${escape(row.color)} · ${escape(row.sizeCm)} cm</p>${state.demo ? `<select class="scenario" aria-label="Escenario de demostración ${row.id}" data-id="${row.id}">${[['normal','Normal'],['sale','Bajada de precio'],['blocked','Captcha / bloqueo'],['rate_limited','Límite (2 minutos)'],['changed','HTML alterado'],['out_of_stock','Sin stock']].map(([value,text]) => `<option value="${value}" ${row.scenario === value ? 'selected' : ''}>${text}</option>`).join('')}</select>` : ''}</td><td><div class="price">${data ? escape(amount(data.bobMinor)) : '—'}</div>${data ? `<span class="original">${escape(amount(data.price.minorUnits, data.price.currency, data.price.scale))} publicado</span>` : ''}${data?.originalPrice ? `<span class="original">Original: <s>${escape(amount(data.originalPrice.minorUnits, data.originalPrice.currency, data.originalPrice.scale))}</s></span>` : ''}${discount !== null ? `<span class="discount">−${discount}%</span>` : ''}</td><td><div class="price">${min ? escape(amount(min.bobMinor)) : '—'}</div><p class="date-label">${min ? escape(date(min.observedAt)) : 'Consulta el histórico'}</p></td><td><span class="status ${kind}">${escape(label)}</span><p class="date-label">Dato: ${escape(date(data?.observedAt))}<br>Intento: ${escape(date(row.lastAttempt?.finishedAt))}</p>${row.work ? `<span class="pending-note">${row.work.state === 'running' ? 'Actualizando…' : `Consulta pendiente · ${escape(date(row.work.availableAt))}`}</span>` : ''}</td><td><div class="row-actions"><button class="row-action" data-action="refresh" data-id="${row.id}" aria-label="Actualizar producto ${row.id}" title="Actualizar ahora" ${row.work?.state === 'running' ? 'disabled' : ''}>↻</button><button class="row-action" data-action="history" data-id="${row.id}" aria-label="Ver histórico del producto ${row.id}" title="Ver histórico">↗</button></div></td></tr>`;
}
function render() {
  $('#mode').textContent = state.demo ? 'Demostración local' : 'Seguimiento en vivo';
  $('#demo-notice').hidden = !state.demo;
  $('#count-tracking').textContent = state.tracking.length;
  $('#count-offers').textContent = state.offers.length;
  $('#best-price').textContent = state.offers.length ? amount(state.offers[0].latest.bobMinor) : '—';
  $('#tab-count').textContent = state.tracking.length;
  $('#rate-date').textContent = `Referencia guardada: ${date(state.exchange?.recordedAt)} (UTC−4)`;
  const next = state.tracking.map(row => Date.parse(row.nextDailyAt)).sort((a,b) => a-b)[0];
  $('#next-check').textContent = next ? date(new Date(next).toISOString()) : 'Sin productos';
  const rows = tab === 'offers' ? state.offers : state.tracking;
  $('#products').innerHTML = rows.map(renderRow).join('');
  $('#empty').hidden = rows.length > 0;
  $('#empty h3').textContent = tab === 'offers' ? 'Aún no hay ofertas elegibles' : 'Tu próxima oferta empieza aquí';
  $('#empty p').textContent = tab === 'offers' ? 'Las ofertas requieren precio en BOB, stock confirmado y una consulta sin fallos posteriores. Tus productos siguen en la pestaña Todos.' : 'Añade el enlace de un producto y su variante. Nos encargamos de seguirle el precio.';
  $('#sort-note').textContent = tab === 'offers' ? 'Menor precio actual en BOB primero' : 'Todos tus seguimientos';
  for (const name of ['all','offers']) { $(`#tab-${name}`).classList.toggle('active', tab === name); $(`#tab-${name}`).setAttribute('aria-pressed', String(tab === name)); }
}
async function load() {
  if (loading) return;
  if (document.activeElement?.matches('.scenario') || $('#history-dialog').open) return;
  loading = true;
  try { state = await api('/api/state'); render(); $('#connection-error').hidden = true; }
  catch { $('#connection-error').textContent = 'No se pudo conectar con el servicio. Comprueba que sigue encendido; tus datos guardados se conservan.'; $('#connection-error').hidden = false; }
  finally { loading = false; }
}
$('#tracking-form').addEventListener('submit', async event => {
  event.preventDefault(); const message = $('#form-message'); message.textContent = ''; message.classList.remove('error'); $('#add-button').disabled = true;
  try {
    const input = Object.fromEntries(new FormData(event.target)); const result = await api('/api/tracking', input);
    message.textContent = result.duplicate ? 'Esta variante ya está en tu radar.' : 'Producto registrado. La primera consulta está en curso.';
    if (!result.duplicate) event.target.reset(); await load();
  } catch (error) { message.textContent = error.message; message.classList.add('error'); }
  finally { $('#add-button').disabled = false; }
});
$('#seed').addEventListener('click', async () => {
  $('#seed').disabled = true;
  try { await api('/api/demo/seed', {}); toast('Ejemplos cargados. Puedes simular una bajada de precio o un bloqueo en cada producto.'); await load(); }
  catch (error) { toast(error.message); } finally { $('#seed').disabled = false; }
});
$('#reload').addEventListener('click', () => { void load(); });
for (const name of ['all','offers']) $(`#tab-${name}`).addEventListener('click', () => { tab = name; render(); });
$('#products').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const id = Number(button.dataset.id);
  try {
    if (button.dataset.action === 'refresh') { await api(`/api/tracking/${id}/refresh`, {}); toast('Consulta solicitada. Se respetarán las pausas de la tienda.'); await load(); }
    else {
      const result = await api(`/api/tracking/${id}/history`); const row = state.tracking.find(item => item.id === id);
      $('#history-variant').textContent = `${row?.latest?.name || row?.storeId} · ${row?.color} · ${row?.sizeCm} cm · America/La_Paz (UTC−4)`;
      $('#history-content').innerHTML = result.history.length ? `<div class="history-summary">Mínimo con stock confirmado <strong>${result.minimum ? escape(amount(result.minimum.bobMinor)) : 'No disponible'}</strong></div><table><thead><tr><th>Fecha</th><th>Publicado</th><th>Precio BOB</th><th>Stock</th><th>Cambio</th></tr></thead><tbody>${result.history.map(item => `<tr><td>${escape(date(item.observedAt))}</td><td>${escape(amount(item.price.minorUnits, item.price.currency, item.price.scale))}</td><td>${escape(amount(item.bobMinor))}</td><td>${escape(item.stock === 'available' ? 'Disponible' : item.stock === 'out_of_stock' ? 'Agotado' : 'Desconocido')}</td><td>${item.conversion ? `1 USD = ${escape(item.conversion.rate)} BOB<br>Manual · ${escape(date(item.conversion.recordedAt))}` : item.price.currency === 'BOB' ? 'BOB directo' : 'Sin conversión'}</td></tr>`).join('')}</tbody></table>` : '<p>No hay observaciones válidas todavía. Los intentos fallidos no crean precios ficticios.</p>';
      $('#history-dialog').showModal();
    }
  } catch (error) { toast(error.message); }
});
$('#products').addEventListener('change', async event => {
  if (!event.target.matches('.scenario')) return;
  try { await api(`/api/tracking/${event.target.dataset.id}/scenario`, { scenario: event.target.value }); event.target.blur(); toast('Escenario aplicado. Actualizando el producto…'); await load(); }
  catch (error) { toast(error.message); }
});
$('#close-history').addEventListener('click', () => { $('#history-dialog').close(); void load(); });
void load(); setInterval(() => { if (!document.hidden) void load(); }, 2500);
