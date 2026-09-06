import type { Command, Projection, SaveEntry, Sector, SlotId } from '../core/types';
import { CANDIDATES, CONTRACT, FEATS, FEAT_EFFECTS, REACTIONS } from '../content/catalog';

type StorageAction = 'save' | 'load' | 'delete' | 'reset' | 'retry';
type PanelKind = 'none' | 'journal' | 'offer' | 'dialogue' | 'pause' | 'Agent fate' | 'Bandit fate' | 'Summary' | 'Feat' | 'load-error' | 'arena-result';
const SECTORS: readonly Sector[] = ['Overhead', 'Right cut', 'Thrust', 'Left cut'];
const SLOTS: readonly SlotId[] = ['1', '2', '3', 'autosave'];

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function text(element: Element, value: string): void {
  if (element.textContent !== value) element.textContent = value;
}

function clock(hours: number): string {
  const minutes = Math.floor(hours * 60 + 1e-7) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function campaignDate(hours: number): string {
  return `Day ${Math.floor(hours / 24) + 1}, ${clock(hours)}`;
}

function facts(entries: readonly (readonly [string, string])[]): HTMLDListElement {
  const list = node('dl', 'facts');
  for (const [label, value] of entries) list.append(node('dt', '', label), node('dd', '', value));
  return list;
}

export class GameUI {
  private state: Projection | null = null;
  private entries: SaveEntry[] = [];
  private storageError = '';
  private storageRevision = 0;
  private panelKind: PanelKind = 'none';
  private panelSignature = '';
  private contextSignature = '';
  private returnFocus: HTMLElement | null = null;
  private readonly context = node('nav', 'context-actions');
  private readonly outlet = node('div', 'panel-layer');
  private readonly notices = node('div', 'notices');
  private readonly message = node('div', 'notice');
  private readonly messageText = node('p');
  private readonly storageNotice = node('div', 'notice notice-error');
  private readonly storageText = node('p');
  private readonly objective = node('div', 'objective');
  private readonly time = node('time');
  private readonly health = node('div', 'health-bar');
  private readonly healthFill = node('div', 'health-fill');
  private readonly sectorControl = node('div', 'sector-control');
  private readonly sectors: Partial<Record<Sector, SVGPathElement>> = {};
  private readonly stamina = node('div', 'stamina-bar');
  private readonly staminaFill = node('div', 'stamina-fill');
  private healthValue = -1;
  private staminaValue = -1;
  private selectedSector: Sector | null = null;

  constructor(
    hud: HTMLElement,
    panels: HTMLElement,
    private readonly send: (command: Command) => void,
    private readonly onStorage: (action: StorageAction, slot?: SlotId) => void,
  ) {
    this.context.setAttribute('aria-label', 'Contextual actions');
    this.objective.append(node('p', '', 'Defend the settlement'), this.time);
    this.health.setAttribute('role', 'progressbar');
    this.health.setAttribute('aria-label', 'Health');
    this.health.setAttribute('aria-valuemin', '0');
    this.health.setAttribute('aria-valuemax', '100');
    this.health.append(this.healthFill);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 112 112');
    svg.setAttribute('aria-hidden', 'true');
    SECTORS.forEach((sector, index) => {
      const wedge = document.createElementNS(svg.namespaceURI, 'path') as SVGPathElement;
      wedge.setAttribute('d', 'M 25 23 A 46 46 0 0 1 87 23 L 67 44 A 17 17 0 0 0 45 44 Z');
      wedge.setAttribute('transform', `rotate(${index * 90} 56 56)`);
      wedge.classList.add('sector');
      svg.append(wedge);
      this.sectors[sector] = wedge;
    });
    this.sectorControl.setAttribute('role', 'img');
    this.sectorControl.setAttribute('aria-label', 'Directional selection');
    this.stamina.setAttribute('role', 'progressbar');
    this.stamina.setAttribute('aria-label', 'Stamina');
    this.stamina.setAttribute('aria-valuemin', '0');
    this.stamina.setAttribute('aria-valuemax', '100');
    this.stamina.append(this.staminaFill);
    this.sectorControl.append(svg, this.stamina);
    this.objective.hidden = this.health.hidden = this.sectorControl.hidden = true;
    hud.replaceChildren(this.objective, this.health, this.sectorControl);
    this.message.setAttribute('role', 'alert');
    this.storageNotice.setAttribute('role', 'alert');
    this.message.append(this.messageText, this.button('Dismiss', 'dismiss-notice', () => { this.message.hidden = true; }, false, 'quiet'));
    this.storageNotice.append(this.storageText, this.button('Retry', 'retry-storage-notice', () => this.onStorage('retry')));
    this.message.hidden = this.storageNotice.hidden = true;
    this.notices.append(this.storageNotice, this.message);
    panels.replaceChildren(this.context, this.outlet, this.notices);
    this.outlet.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...this.outlet.querySelectorAll<HTMLElement>('button:not(:disabled), summary, [tabindex="0"]')]
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === this.outlet.firstElementChild)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    });
  }

  render(state: Projection): void {
    this.state = state;
    this.objective.hidden = !state.arena && state.campaign.contract !== 'Accepted';
    if (!this.objective.hidden) {
      text(this.objective.firstElementChild!, state.arena ? `${state.arena.mode} Arena` : 'Defend the settlement');
      text(this.time, state.arena ? state.phase === 'Setup' ? `Prepare · ${Math.ceil(state.setupRemaining)}s`
        : `${state.combatants.filter(actor => actor.team === 'Raiders' && actor.status === 'Active').length} opponents active`
        : clock(state.campaign.time));
    }
    const player = state.combatants.find((actor) => actor.id === 'player');
    const member = state.campaign.members.find((item) => item.role === 'Player');
    const health = Math.max(0, Math.min(100, player ? player.health / player.maxHealth * 100 : member?.health ?? 0));
    this.health.hidden = !state.arena && state.campaign.scene !== 'settlement';
    if (this.healthValue !== health) {
      this.healthValue = health;
      this.healthFill.style.transform = `scaleX(${health / 100})`;
      this.health.setAttribute('aria-valuenow', String(Math.round(health)));
    }
    this.sectorControl.hidden = !player || (state.phase !== 'Setup' && state.phase !== 'Battle')
      || !(player.action === 'Preview' || (player.action === 'Guard' && player.guardMode === 'Directional Guard'));
    if (!this.sectorControl.hidden && player) {
      if (this.selectedSector !== player.sector) {
        this.selectedSector = player.sector;
        for (const sector of SECTORS) this.sectors[sector]!.classList.toggle('selected', sector === player.sector);
        this.sectorControl.setAttribute('aria-label', player.sector ?? 'Choose an attack or guard sector');
      }
      if (this.staminaValue !== player.stamina) {
        this.staminaValue = player.stamina;
        this.staminaFill.style.transform = `scaleX(${Math.max(0, Math.min(100, player.stamina)) / 100})`;
        this.stamina.setAttribute('aria-valuenow', String(Math.round(player.stamina)));
      }
    }
    const kind = this.kind(state);
    this.storageNotice.hidden = Boolean(state.arena) || !this.storageError || kind === 'journal' || kind === 'pause';
    this.renderContext(state, kind);
    const signature = this.signature(state, kind);
    if (signature !== this.panelSignature) {
      const previousKind = this.panelKind;
      this.panelKind = kind;
      this.panelSignature = signature;
      if (kind === 'none') {
        this.outlet.replaceChildren();
        if (previousKind !== 'none') {
          if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
          else this.context.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
          this.returnFocus = null;
        }
      } else {
        if (previousKind === 'none' && document.activeElement instanceof HTMLElement) this.returnFocus = document.activeElement;
        this.replaceRegion(this.outlet, this.buildPanel(state, kind), previousKind !== kind);
      }
    }
    if (kind === 'journal') this.updateJournalClock(state);
  }

  storage(entries: SaveEntry[], error?: string): void {
    this.entries = entries;
    this.storageError = error ?? '';
    this.storageRevision++;
    text(this.storageText, this.storageError ? `${this.storageError} Your current campaign remains playable in memory.` : '');
    if (this.state) this.render(this.state);
  }

  notify(message: string): void {
    text(this.messageText, message);
    this.message.hidden = !message;
  }

  private button(label: string, key: string, action: () => void, disabled = false, className = ''): HTMLButtonElement {
    const button = node('button', className, label);
    button.type = 'button';
    button.disabled = disabled;
    button.dataset.focus = key;
    button.addEventListener('click', action);
    return button;
  }

  private action(label: string, key: string, command: Command, disabled = false, className = ''): HTMLButtonElement {
    return this.button(label, key, () => this.send(command), disabled, className);
  }

  private kind(state: Projection): PanelKind {
    if (state.boundary === 'Load failed') return 'load-error';
    if (state.arena && state.phase === 'Summary') return 'arena-result';
    if (state.phase === 'Agent fate' || state.phase === 'Bandit fate' || state.phase === 'Summary' || state.phase === 'Feat') return state.phase;
    if (state.offerOpen) return 'offer';
    if (state.dialogue !== null) return 'dialogue';
    if (state.journalOpen) return 'journal';
    if (state.paused) return 'pause';
    return 'none';
  }

  private signature(state: Projection, kind: PanelKind): string {
    const campaign = state.campaign;
    if (kind === 'none') return kind;
    if (kind === 'arena-result') return `${kind}|${state.arena?.mode}|${state.outcome}|${state.battleTime}`;
    if (kind === 'journal') return JSON.stringify([kind, campaign.contract, campaign.deadline, campaign.raidLocation,
      campaign.condition, campaign.coin, campaign.members, campaign.agents, campaign.captives, campaign.enemyChoice,
      campaign.banditChoice, campaign.banditDowned, campaign.banditKilled, campaign.feat, campaign.casualties,
      state.boundary, state.phase, campaign.deadline !== null && campaign.time >= campaign.deadline, this.storageRevision]);
    if (kind === 'pause') return `${kind}|${state.phase}|${state.boundary}|${state.speed}|${state.arena?.mode}|${this.storageRevision}`;
    if (kind === 'Agent fate' || kind === 'Bandit fate') return `${kind}|${state.pendingChoice}|${campaign.banditDowned}`;
    if (kind === 'dialogue') return JSON.stringify([kind, state.dialogue, campaign.contract, campaign.enemyChoice, campaign.agents]);
    if (kind === 'offer') return `${kind}|${campaign.contract}`;
    return `${kind}|${campaign.contract}|${campaign.feat}|${campaign.enemyChoice}|${campaign.banditChoice}`;
  }

  private replaceRegion(parent: HTMLElement, child: HTMLElement, focusPanel = false): void {
    const active = document.activeElement instanceof HTMLElement && parent.contains(document.activeElement)
      ? document.activeElement.dataset.focus : undefined;
    const open = new Set([...parent.querySelectorAll<HTMLDetailsElement>('details[open]')].map((item) => item.dataset.detail));
    const scroll = parent.firstElementChild?.scrollTop ?? 0;
    parent.replaceChildren(child);
    child.querySelectorAll<HTMLDetailsElement>('details').forEach((item) => { if (open.has(item.dataset.detail)) item.open = true; });
    child.scrollTop = scroll;
    const replacement = active ? child.querySelector<HTMLElement>(`[data-focus="${CSS.escape(active)}"]`) : null;
    if (replacement && !(replacement instanceof HTMLButtonElement && replacement.disabled)) replacement.focus({ preventScroll: true });
    else if (focusPanel || active) child.focus({ preventScroll: true });
  }

  private renderContext(state: Projection, kind: PanelKind): void {
    this.context.hidden = kind !== 'none' || state.boundary === 'Transitioning' || state.boundary === 'Restoring snapshot';
    if (this.context.hidden) return;
    const combat = state.phase === 'Setup' || state.phase === 'Battle';
    const companion = state.combatants.some((actor) => actor.role === 'Companion' && actor.status === 'Active');
    const troops = state.combatants.some((actor) => actor.role === 'Troop' && actor.status === 'Active');
    const key = `${state.phase}|${state.boundary}|${state.campaign.contract}|${state.arena?.mode}|${state.selectedGroup}|${state.groups.Companion.order}|${state.groups.Troops.order}|${state.placingHold}|${companion}|${troops}`;
    if (this.contextSignature === key) return;
    this.contextSignature = key;
    const container = node('div', combat ? 'context-inner combat-context' : 'context-inner');
    if (combat) {
      const groups = node('div', 'button-row command-groups');
      groups.setAttribute('role', 'group');
      groups.setAttribute('aria-label', 'Command group');
      for (const group of ['Companion', 'Troops'] as const) {
        const button = this.action(group, `group-${group}`, { type: 'select-group', group }, group === 'Companion' ? !companion : !troops);
        button.setAttribute('aria-pressed', String(state.selectedGroup === group));
        groups.append(button);
      }
      const orders = node('div', 'button-row command-orders');
      orders.setAttribute('role', 'group');
      orders.setAttribute('aria-label', `Orders for ${state.selectedGroup}`);
      for (const order of ['Follow', 'Hold', 'Engage'] as const) {
        const button = this.action(order, `order-${order}`, { type: 'order', order }, state.selectedGroup === 'Companion' ? !companion : !troops);
        button.setAttribute('aria-pressed', String(order === 'Hold' && state.placingHold || state.groups[state.selectedGroup].order === order));
        if (order === 'Hold') button.title = 'Choose Hold, then click traversable ground to place the marker.';
        orders.append(button);
      }
      container.append(groups, orders);
      if (state.arena?.mode === 'Duel') { groups.hidden = true; orders.hidden = true; }
      if (state.placingHold) container.append(this.action('Cancel placement', 'cancel-placement', { type: 'close' }, false, 'quiet'));
    } else {
      const actions = node('div', 'button-row');
      if (state.phase === 'Settlement' && state.boundary === 'Safe non-combat') {
        actions.append(
          this.action('Talk · Mara Venn', 'talk-giver', { type: 'talk', agentId: 'giver' }),
          this.action('Talk · Oren Reed', 'talk-resident', { type: 'talk', agentId: 'resident-agent' }),
          this.action('Wait', 'wait', { type: 'wait' }, state.campaign.contract !== 'Available' && state.campaign.contract !== 'Accepted'),
          this.action('Journal', 'journal', { type: 'journal' }),
          this.action('Leave', 'leave', { type: 'leave' }),
        );
      } else {
        actions.append(this.action('Journal', 'journal', { type: 'journal' }, state.boundary !== 'Safe non-combat'));
      }
      container.append(actions);
      if (state.phase === 'Settlement' && state.boundary === 'Safe non-combat') {
        const arena = node('details', 'arena-menu');
        arena.dataset.detail = 'arena-menu';
        const summary = node('summary', '', 'Arena'); summary.dataset.focus = 'arena-menu';
        const choices = node('div', 'arena-choices');
        choices.append(node('p', '', 'Combat practice. Your campaign and saves stay unchanged.'),
          this.action('Duel', 'arena-duel', { type: 'arena-start', mode: 'Duel' }),
          this.action('Team battle', 'arena-team', { type: 'arena-start', mode: 'Team' }));
        arena.append(summary, choices); container.append(arena);
      }
    }
    const utility = node('div', 'context-utility');
    utility.append(this.controls(state, true), this.action('Pause', 'pause', { type: 'pause' }, false, 'quiet'));
    if (state.arena) utility.append(this.action('Exit Arena', 'arena-exit', { type: 'arena-exit' }, false, 'quiet'));
    container.append(utility);
    this.replaceRegion(this.context, container);
  }

  private buildPanel(state: Projection, kind: Exclude<PanelKind, 'none'>): HTMLElement {
    const panel = node('section', `game-panel panel-${kind.toLowerCase().replaceAll(' ', '-')}`);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'panel-title');
    panel.tabIndex = -1;
    const heading = node('header', 'panel-heading');
    const label = kind === 'journal' ? 'The Band’s record' : kind === 'offer' ? 'A Local Contract' : kind === 'pause' ? 'A moment’s respite'
      : kind === 'arena-result' ? `${state.arena!.mode} Arena · Combat practice`
      : kind === 'Agent fate' || kind === 'Bandit fate' ? 'The field falls quiet' : kind === 'Feat' ? 'What the battle taught you' : 'Bold and Brave';
    const title = kind === 'journal' ? 'Journal' : kind === 'offer' ? CONTRACT.title : kind === 'pause' ? 'Paused'
      : kind === 'Agent fate' ? state.campaign.agents.find((agent) => agent.id === 'enemy')?.name ?? 'Enemy Agent'
      : kind === 'Bandit fate' ? 'The surviving bandits' : kind === 'Summary' ? state.outcome ?? 'Outcome summary'
      : kind === 'arena-result' ? state.outcome ?? 'Arena result'
      : kind === 'Feat' ? 'Choose one Feat' : kind === 'load-error' ? 'Scene load failed'
      : state.campaign.agents.find((agent) => agent.id === state.dialogue)?.name ?? 'Talk';
    heading.append(node('p', 'eyebrow', label));
    const h = node('h1', '', title); h.id = 'panel-title'; heading.append(h);
    if (['journal', 'offer', 'dialogue'].includes(kind)) heading.append(this.action('Close', 'close-panel', { type: 'close' }, false, 'panel-close quiet'));
    panel.append(heading);
    if (kind === 'journal') this.journal(panel, state);
    else if (kind === 'offer') this.offer(panel, state);
    else if (kind === 'dialogue') this.dialogue(panel, state);
    else if (kind === 'pause') {
      panel.append(this.action('Resume', 'resume', { type: 'pause' }, false, 'primary'), this.controls(state));
      if (state.boundary === 'Safe non-combat') panel.append(this.action('Journal', 'pause-journal', { type: 'journal' }));
      if (state.arena) {
        panel.append(node('p', 'read-only-note', 'Arena practice is not saved. Your campaign does not advance or change.'), this.arenaActions(state));
      } else panel.append(this.saves(state));
    } else if (kind === 'Agent fate' || kind === 'Bandit fate') this.fate(panel, state);
    else if (kind === 'arena-result') {
      panel.append(node('p', 'lede', state.outcome === 'Victory' ? 'Your opponents can no longer fight.' : 'Your Band can no longer fight.'),
        facts([
          ['Mode', state.arena!.mode], ['Battle time', `${state.battleTime.toFixed(1)} seconds`],
          ['Band still active', String(state.combatants.filter(actor => actor.team === 'Band' && actor.status === 'Active').length)],
          ['Opponents still active', String(state.combatants.filter(actor => actor.team === 'Raiders' && actor.status === 'Active').length)],
        ]), node('p', 'read-only-note', 'No campaign consequences, Agent fate decisions or Feat rewards. Restart with everyone restored, choose the other mode, or exit.'), this.arenaActions(state));
    }
    else if (kind === 'Summary') this.summary(panel, state);
    else if (kind === 'Feat') {
      panel.append(node('p', 'lede', 'Carry one lesson back to the settlement. This choice is permanent for this journey.'));
      const choices = node('div', 'feat-choices');
      for (const feat of FEATS) {
        const choice = this.action(feat, `feat-${feat}`, { type: 'choose-feat', feat }, false, 'feat-choice');
        choice.append(node('span', 'choice-description', FEAT_EFFECTS[feat]));
        choices.append(choice);
      }
      panel.append(choices);
    } else {
      panel.append(node('p', 'lede', 'The Scene could not be loaded. Play and saving remain stopped until the Scene is ready.'),
        this.action('Retry', 'retry-transition', { type: 'retry-transition' }, false, 'primary'));
    }
    return panel;
  }

  private arenaActions(state: Projection): HTMLElement {
    const actions = node('div', 'button-row arena-actions');
    const mode = state.arena!.mode === 'Duel' ? 'Team' : 'Duel';
    actions.append(this.action('Restart Arena', 'arena-restart', { type: 'arena-restart' }, false, 'primary'),
      this.action(mode === 'Team' ? 'Team battle' : 'Duel', 'arena-switch', { type: 'arena-start', mode }),
      this.action('Exit Arena', 'arena-exit', { type: 'arena-exit' }));
    return actions;
  }

  private offer(panel: HTMLElement, state: Projection): void {
    panel.append(node('p', 'lede', CONTRACT.objective), facts([
      ['Local Contract state', state.campaign.contract], ['Defense', 'The bridge outside the settlement'],
      ['Threat', CONTRACT.threat], ['Victory reward', CONTRACT.reward], ['Settlement risk', CONTRACT.risk],
      ['Raid deadline', state.campaign.deadline === null ? '12 Overworld hours after acceptance' : campaignDate(state.campaign.deadline)],
    ]), node('p', 'fine-print', 'Wait in the settlement to defend the bridge. Enter from the Overworld after the Raid deadline and the battle begins in the settlement center, without a setup window.'));
    if (state.campaign.contract === 'Available') {
      const actions = node('div', 'button-row panel-footer');
      actions.append(this.action('Accept', 'accept-contract', { type: 'accept' }, false, 'primary'), this.action('Decline', 'decline-contract', { type: 'decline' }));
      panel.append(actions);
    }
  }

  private dialogue(panel: HTMLElement, state: Projection): void {
    const agent = state.campaign.agents.find((item) => item.id === state.dialogue);
    if (!agent || (agent.id !== 'giver' && agent.id !== 'resident-agent')) return;
    const reaction = state.campaign.contract === 'Failed' ? 'Failed'
      : state.campaign.contract === 'Resolved' && state.campaign.enemyChoice ? state.campaign.enemyChoice
      : state.campaign.contract === 'Accepted' ? 'Accepted' : 'Available';
    panel.append(node('blockquote', 'dialogue-text', REACTIONS[reaction][agent.id]), facts([
      ['Agent fate', agent.fate], ...(agent.disposition ? [['Disposition', agent.disposition] as const] : []),
      ['Grievances', agent.grievances.join(' · ') || 'None'],
    ]));
  }

  private journal(panel: HTMLElement, state: Projection): void {
    const campaign = state.campaign;
    const introduction = node('div', 'journal-intro');
    introduction.append(facts([
      ['Local Contract', campaign.contract], ['Coin', String(campaign.coin)], ['Provisions', campaign.provisions.toFixed(1)],
      ['Current Feat', campaign.feat ?? 'None chosen'],
      ...(campaign.deadline === null ? [] : [['Raid deadline', campaignDate(campaign.deadline)] as const]),
    ]));
    introduction.querySelectorAll('dd')[2]!.setAttribute('data-value', 'provisions');
    panel.append(introduction);
    if (campaign.contract === 'Accepted') panel.append(node('p', 'journal-objective', CONTRACT.objective));
    if (campaign.contract === 'Resolved' || campaign.contract === 'Failed') panel.append(node('p', 'read-only-note', 'The Local Contract is over. Preparation and the contract record are now read-only.'));
    const band = this.section('Your Band');
    const table = node('table', 'band-table');
    const head = node('thead'); const row = node('tr');
    for (const label of ['Name', 'Role', 'Health', 'Availability', 'Equipment']) { const cell = node('th', '', label); cell.scope = 'col'; row.append(cell); }
    head.append(row); table.append(head);
    const body = node('tbody');
    for (const member of campaign.members) {
      const item = node('tr');
      const name = node('th', '', member.name); name.scope = 'row';
      item.append(name, node('td', '', member.role), node('td', '', String(member.health)),
        node('td', '', member.available ? 'Available' : 'Unavailable'), node('td', '', member.shield ? `${member.weapon} and shield` : member.weapon));
      body.append(item);
    }
    table.append(body);
    const scroll = node('div', 'table-scroll'); scroll.append(table); band.append(scroll); panel.append(band);
    const preparation = this.section('Preparation');
    const recruitable = state.boundary === 'Safe non-combat' && (campaign.contract === 'Available' || campaign.contract === 'Accepted')
      && (campaign.deadline === null || campaign.time < campaign.deadline);
    preparation.append(node('p', 'fine-print', 'Each Troop joins with a fixed Staff loadout. Recruiting two Troops costs 50 Coin.'));
    const candidates = node('ul', 'candidate-list');
    for (const candidate of CANDIDATES) {
      const recruited = campaign.members.some((member) => member.id === candidate.id);
      const lost = campaign.casualties.band.includes(candidate.id) && !recruited;
      const item = node('li');
      const info = node('div');
      info.append(node('strong', '', candidate.name), node('span', 'muted', recruited ? 'In your Band' : lost ? 'Killed' : 'Troop · Staff · 25 Coin'));
      const disabled = !recruitable || recruited || campaign.coin < 25;
      const button = this.button(recruited ? 'Recruited' : 'Recruit', `recruit-${candidate.id}`, () => {
        if (window.confirm(`Recruit ${candidate.name} to your Band for 25 Coin?`)) this.send({ type: 'recruit', candidateId: candidate.id, confirmed: true });
      }, disabled);
      if (disabled) button.title = recruited ? 'Already in your Band.' : !recruitable ? 'Preparation is closed.' : 'Requires 25 Coin.';
      item.append(info, button); candidates.append(item);
    }
    preparation.append(candidates); panel.append(preparation);
    const consequences = this.section('Persistent consequences');
    consequences.append(facts([
      ['Settlement condition', campaign.condition ?? 'Not yet determined'], ['Raid location', campaign.raidLocation ?? 'Not yet determined'],
      ['Enemy Agent choice', campaign.enemyChoice ?? 'Not resolved'], ['Ordinary-bandit choice', campaign.banditChoice ?? 'Not resolved'],
      ['Downed ordinary bandits', String(campaign.banditDowned)], ['Killed ordinary bandits', String(campaign.banditKilled)],
      ['Captives', String(campaign.captives)], ['Band casualties', this.casualties(state)], ['Resident casualties', `${campaign.casualties.residents} of 5`],
    ]));
    const agents = node('div', 'agent-records');
    for (const agent of campaign.agents) {
      const record = node('article', 'agent-record');
      record.append(node('h3', '', agent.name), facts([
        ['Agent fate', agent.fate], ...(agent.disposition ? [['Disposition', agent.disposition] as const] : []),
        ['Grievances', agent.grievances.join(' · ') || 'None'],
      ]));
      agents.append(record);
    }
    consequences.append(agents); panel.append(consequences);
    if (campaign.feat) { const feat = this.section(campaign.feat); feat.append(node('p', '', FEAT_EFFECTS[campaign.feat])); panel.append(feat); }
    const record = node('details', 'campaign-record'); record.dataset.detail = 'campaign-record';
    record.append(node('summary', '', 'Campaign record'));
    const values = facts([['Scene', ''], ['Campaign time', ''], ['Exact campaign hours', ''], ['Position (x, z)', ''], ['Provisions remainder', ''], ['Random-source state', '']]);
    ['scene', 'campaign-time', 'exact-time', 'position', 'remainder', 'random-state'].forEach((name, index) => { values.querySelectorAll('dd')[index]!.setAttribute('data-value', name); });
    record.append(values); panel.append(record, this.saves(state));
  }

  private updateJournalClock(state: Projection): void {
    const campaign = state.campaign;
    const values: Record<string, string> = {
      provisions: campaign.provisions.toFixed(1), scene: campaign.scene === 'overworld' ? 'Overworld' : 'Settlement',
      'campaign-time': campaignDate(campaign.time), 'exact-time': `${campaign.time} hours`,
      position: `${campaign.position.x}, ${campaign.position.z}`, remainder: `${campaign.provisionRemainder} Band-member-days`,
      'random-state': String(campaign.randomState),
    };
    this.outlet.querySelectorAll<HTMLElement>('[data-value]').forEach((element) => text(element, values[element.dataset.value!] ?? ''));
  }

  private section(title: string): HTMLElement {
    const section = node('section', 'journal-section');
    section.append(node('h2', '', title));
    return section;
  }

  private casualties(state: Projection): string {
    return state.campaign.casualties.band.map((id) => {
      const actor = state.combatants.find((item) => item.id === id);
      const member = state.campaign.members.find((item) => item.id === id);
      const name = actor?.name ?? member?.name ?? CANDIDATES.find((item) => item.id === id)?.name ?? id;
      const status = actor && actor.status !== 'Active' ? actor.status : member ? 'Downed' : 'Killed';
      return `${name} — ${status}`;
    }).join('; ') || 'None';
  }

  private fate(panel: HTMLElement, state: Projection): void {
    const agentChoice = state.phase === 'Agent fate';
    const enemy = state.campaign.agents.find((agent) => agent.id === 'enemy');
    const subject = agentChoice ? enemy?.name ?? 'the enemy Agent' : `all ${state.campaign.banditDowned} Downed ordinary bandits`;
    panel.append(node('p', 'lede', agentChoice ? 'Alive, disarmed, and at your mercy. Decide his fate.' : `${state.campaign.banditDowned} ordinary bandits survived. One decision applies to them all; those killed in battle are unchanged.`));
    if (state.pendingChoice) {
      const confirmation = node('div', 'fate-confirmation');
      confirmation.append(node('h2', '', `${state.pendingChoice} ${subject}?`), node('p', '', 'Confirm this decision to continue. It cannot be reversed in this journey.'));
      const actions = node('div', 'button-row');
      actions.append(this.action('Confirm', 'confirm-fate', { type: 'confirm-fate' }, false, state.pendingChoice === 'Execute' ? 'danger' : 'primary'),
        this.action('Cancel', 'cancel-fate', { type: 'cancel-fate' }));
      confirmation.append(actions); panel.append(confirmation);
    } else {
      const actions = node('div', 'fate-choices');
      for (const choice of ['Release', 'Capture', 'Execute'] as const) {
        const button = this.action(choice, `fate-${choice}`, { type: 'choose-fate', choice }, false, choice === 'Execute' ? 'danger-outline' : '');
        button.append(node('span', 'choice-description', choice === 'Release' ? 'Let the survivors leave.' : choice === 'Capture' ? 'Retain the survivors as Captives.' : 'End the survivors’ lives.'));
        actions.append(button);
      }
      panel.append(actions);
    }
  }

  private summary(panel: HTMLElement, state: Projection): void {
    const campaign = state.campaign;
    const enemy = campaign.agents.find((agent) => agent.id === 'enemy');
    panel.append(node('p', 'lede', state.outcome === 'Victory' ? 'The raid is ended. Its cost will stay with the Band and the settlement.' : 'The defense has failed. The losses are final; the settlement must live with what remains.'), facts([
      ['Outcome', state.outcome ?? ''], ['Band casualties', this.casualties(state)], ['Resident casualties', `${campaign.casualties.residents} of 5`],
      ['Enemy Agent', enemy ? `${enemy.name} — ${enemy.fate}${campaign.enemyChoice ? ` (${campaign.enemyChoice})` : '; survivor fate not chosen'}` : 'Not resolved'],
      ['Ordinary bandits', `${campaign.banditKilled} killed; ${campaign.banditDowned} Downed${campaign.banditChoice ? ` — ${campaign.banditChoice}` : '; no survivor choice'}`],
      ['Captives', String(campaign.captives)], ['Settlement condition', campaign.condition ?? 'Not yet determined'], ['Local Contract state', campaign.contract],
    ]), this.action(state.outcome === 'Victory' ? 'Continue to Feat choice' : 'Return to settlement', 'continue-summary', { type: 'continue' }, false, 'primary'));
  }

  private saves(state: Projection): HTMLElement {
    const section = this.section('Campaign saves');
    const safe = state.boundary === 'Safe non-combat';
    const enabled = safe && !this.storageError;
    if (!safe) section.append(node('p', 'read-only-note', `Save and load unavailable: ${state.boundary}.`));
    if (this.storageError) {
      const error = node('p', 'inline-error', this.storageError);
      error.setAttribute('role', 'alert');
      section.append(error, this.button('Retry', 'retry-storage-panel', () => this.onStorage('retry')));
    }
    const slots = node('div', 'save-slots');
    for (const slot of SLOTS) {
      const entry = this.entries.find((item) => item.slot === slot);
      const occupied = Boolean(entry?.snapshot || entry?.reason);
      const card = node('article', 'save-slot');
      const title = slot === 'autosave' ? 'Recovery autosave' : `Manual slot ${slot}`;
      card.append(node('h3', '', title));
      if (entry?.reason) card.append(node('p', 'inline-error', `Unavailable: ${entry.reason}`));
      else if (entry?.snapshot) {
        const saved = entry.snapshot.campaign;
        card.append(node('p', 'save-description', `${saved.scene === 'overworld' ? 'Overworld' : 'Settlement'} · ${saved.contract} · ${campaignDate(saved.time)}`));
        const date = new Date(entry.savedAt);
        const timestamp = node('time', 'muted', Number.isNaN(date.getTime()) ? entry.savedAt : date.toLocaleString());
        timestamp.dateTime = entry.savedAt; card.append(timestamp);
      } else card.append(node('p', 'muted', 'Empty'));
      const actions = node('div', 'button-row');
      if (slot !== 'autosave') actions.append(this.button('Save', `save-${slot}`, () => {
        if (window.confirm(occupied ? `Overwrite ${title} with the current campaign?` : `Save the current campaign in ${title}?`)) this.onStorage('save', slot);
      }, !enabled));
      actions.append(this.button('Load', `load-${slot}`, () => this.onStorage('load', slot), !enabled || !entry?.snapshot || Boolean(entry.reason)));
      if (slot !== 'autosave') actions.append(this.button('Delete', `delete-${slot}`, () => {
        if (window.confirm(`Delete ${title}? This cannot be undone.`)) this.onStorage('delete', slot);
      }, !enabled || !occupied, 'quiet danger-text'));
      card.append(actions); slots.append(card);
    }
    section.append(slots, node('p', 'fine-print', 'The recovery autosave is updated only after a successful Scene transition. Manual slots are never overwritten automatically.'),
      this.button('Reset all local campaign data', 'reset-storage', () => {
        if (window.confirm('Delete all three manual slots and the recovery autosave? This cannot be undone.')) this.onStorage('reset');
      }, !enabled, 'quiet danger-text'));
    return section;
  }

  private controls(state: Projection, compact = false): HTMLDetailsElement {
    const details = node('details', compact ? 'controls compact-controls' : 'controls');
    details.dataset.detail = 'controls';
    const summary = node('summary', '', 'Controls'); summary.dataset.focus = 'controls'; details.append(summary);
    const content = node('div', 'controls-content');
    content.append(node('h2', '', state.phase === 'Travel' ? 'Across the frontier' : 'On the ground'));
    const controls: (readonly [string, string])[] = state.phase === 'Travel'
      ? [['Left click', 'Travel to traversable ground. Enter the settlement by reaching its marker.'], ['Right drag / mouse wheel', 'Rotate the camera / zoom.'], ['Space', 'Pause or resume travel.'], ['1 · 2 · 3 · 4', 'Travel at 1× · 2× · 3× · 4× speed; resume if paused.']]
      : [['Mouse move', 'Turn the camera and character together.'], ['W / S · A / D', 'Move forward / backward; sidestep left / right.'], ['Middle click', 'Toggle continuous mouse look. Escape releases the mouse first.'], ['Mouse wheel', 'Zoom.']];
    if (state.phase === 'Setup' || state.phase === 'Battle') controls.push(
      ['Left hold + drag, release', 'Preview a sword attack: up for Overhead, left or right for a cut, down for a forward stab (Thrust). Release to commit.'],
      ['Right mouse hold', 'Hold your defense. In Directional Guard mode, move the mouse to match the attack sector. Release to lower your defense.'],
      ['Q while idle', 'Toggle sword Directional Guard and Shield Block. In Shield Block mode, hold the right mouse button to block.'],
      ['1 / 2', 'Select the Companion / Troops Command group.'], ['F / H / E', 'Follow / Hold / Engage. After Hold, left click traversable ground to place the marker.'],
      ['Escape', 'Cancel Hold placement, or pause and resume combat. Space has no combat action.'],
    );
    else controls.push(['J', 'Open or close the Journal.'], ['Escape', 'Close a panel, or pause and resume.']);
    content.append(facts(controls));
    if (state.phase === 'Travel') {
      const speeds = node('div', 'button-row');
      speeds.setAttribute('role', 'group'); speeds.setAttribute('aria-label', 'Travel speed');
      for (const speed of [1, 2, 3, 4]) speeds.append(this.action(`${speed}×`, `speed-${speed}`, { type: 'speed', speed }));
      content.append(speeds);
    } else if (state.phase === 'Setup' || state.phase === 'Battle') {
      content.append(this.action('Toggle guard mode', 'guard-mode', { type: 'guard-mode' }, state.paused));
    }
    if (state.phase === 'Settlement') content.append(node('p', 'fine-print', 'Talk to Mara Venn for the Local Contract, or Oren Reed for his view of events. Wait advances one Overworld hour before the raid; ordinary interaction does not advance time.'));
    if (state.phase === 'Setup') content.append(node('p', 'fine-print', state.arena
      ? 'Team Arena setup lasts 15 real-time seconds. Move into position and place Hold markers before the opponents advance.'
      : 'The bridge setup lasts 15 real-time seconds. Move into position and place Hold markers before the raiders advance.'));
    details.append(content); return details;
  }
}
