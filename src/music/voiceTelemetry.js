import {
  VoiceConnectionStatus,
  AudioPlayerStatus,
} from '@discordjs/voice';

const NETWORKING_CODE_NAMES = {
  0: 'OpeningWs',
  1: 'Identifying',
  2: 'UdpHandshaking',
  3: 'SelectingProtocol',
  4: 'Ready',
  5: 'Resuming',
  6: 'Closed',
};

function describeNetworking(state) {
  if (!state || !state.networking) return null;
  const ns = state.networking.state;
  return {
    code: ns?.code,
    name: ns?.code != null ? NETWORKING_CODE_NAMES[ns.code] || String(ns.code) : null,
    udpRemote: ns?.connectionData
      ? { ip: ns.connectionData.ip, port: ns.connectionData.port }
      : ns?.connectionOptions
        ? { ip: ns.connectionOptions.serverIp, port: ns.connectionOptions.serverPort }
        : null,
    encryptionMode: ns?.connectionData?.encryptionMode || null,
    sessionId: ns?.sessionId || ns?.connectionOptions?.sessionId || null,
    wsKeys: ns?.ws ? Object.keys(ns.ws) : null,
  };
}

/**
 * The networking layer in @discordjs/voice 0.18 has the underlying
 * VoiceWebSocket on `state.ws` while in OpeningWs/Identifying/UdpHandshaking/
 * SelectingProtocol. The Closed state preserves nothing. So whenever we see a
 * `ws`, we attach close + raw payload listeners so we can capture the WS close
 * code when Discord boots us. We also snapshot the IDENTIFY payload (with
 * the token redacted) so we can confirm what the bot actually sent.
 */
function attachWsListeners(ws, log) {
  if (!ws || ws.__telemetryAttached) return;
  ws.__telemetryAttached = true;
  log.debug({ wsKeys: Object.keys(ws) }, 'voice: attaching ws listeners');

  ws.on('close', (ev) => {
    log.warn(
      {
        wsCloseCode: ev?.code,
        wsCloseReason: ev?.reason,
        wsCloseWasClean: ev?.wasClean,
      },
      'voice: ws close',
    );
  });
  ws.on('error', (err) => {
    log.error({ err: err?.message, stack: err?.stack }, 'voice: ws error');
  });
  ws.on('packet', (pkt) => {
    log.debug({ op: pkt?.op, dKeys: pkt?.d ? Object.keys(pkt.d) : null }, 'voice: ws recv packet');
  });
  // Some implementations expose `'open'`
  if (ws.on && typeof ws.on === 'function') {
    ws.on('open', () => log.debug('voice: ws open'));
  }
}

function describeConnState(state) {
  if (!state) return null;
  return {
    status: state.status,
    reason: state.reason,
    closeCode: state.closeCode,
    networking: describeNetworking(state),
  };
}

/**
 * Attach exhaustive lifecycle logging to a VoiceConnection.
 *
 * @param {import('@discordjs/voice').VoiceConnection} connection
 * @param {import('pino').Logger} log  child logger (already bound with reqId, guildId, voiceChannelId)
 */
export function attachConnectionTelemetry(connection, log) {
  log.info(
    { initialStatus: connection.state?.status },
    'voice: joinVoiceChannel called',
  );

  connection.on('stateChange', (oldState, newState) => {
    log.info(
      {
        from: oldState.status,
        to: newState.status,
        reason: newState.reason,
        closeCode: newState.closeCode,
        networking: describeNetworking(newState),
      },
      'voice: connection state change',
    );
    const ws = newState?.networking?.state?.ws;
    if (ws) attachWsListeners(ws, log);
  });

  // The Networking instance (state.networking) emits its own stateChange
  // events when networking sub-state transitions (OpeningWs -> Identifying
  // -> UdpHandshaking -> SelectingProtocol -> Ready). On each such transition
  // the underlying VoiceWebSocket may be a *new* object, so we re-attach our
  // close/error listeners every time.
  function watchNetworking() {
    const networking = connection.state?.networking;
    if (!networking || networking.__telemetryWatched) return;
    networking.__telemetryWatched = true;
    networking.on?.('stateChange', (oldNs, newNs) => {
      log.info(
        {
          from: { code: oldNs?.code, name: NETWORKING_CODE_NAMES[oldNs?.code] || null },
          to: { code: newNs?.code, name: NETWORKING_CODE_NAMES[newNs?.code] || null },
          udpRemote: newNs?.connectionData
            ? { ip: newNs.connectionData.ip, port: newNs.connectionData.port }
            : newNs?.connectionOptions
              ? { ip: newNs.connectionOptions.serverIp, port: newNs.connectionOptions.serverPort }
              : null,
          encryptionMode: newNs?.connectionData?.encryptionMode || null,
        },
        'voice: networking sub-state change',
      );
      if (newNs?.ws) attachWsListeners(newNs.ws, log);
    });
    networking.on?.('error', (err) =>
      log.error({ err: err?.message, stack: err?.stack }, 'voice: networking error'),
    );
    networking.on?.('close', (code, reason) =>
      log.warn({ wsCloseCode: code, wsCloseReason: String(reason || '') }, 'voice: networking close'),
    );
    if (networking.state?.ws) attachWsListeners(networking.state.ws, log);
  }
  connection.on('stateChange', watchNetworking);
  watchNetworking();

  connection.on('debug', (msg) => {
    log.debug({ msg }, 'voice: connection debug');
  });

  connection.on('error', (err) => {
    log.error({ err: err?.message, stack: err?.stack }, 'voice: connection error');
  });

  for (const status of Object.values(VoiceConnectionStatus)) {
    connection.on(status, () => {
      log.debug(
        { status, networking: describeNetworking(connection.state) },
        `voice: status event ${status}`,
      );
    });
  }
}

/**
 * Attach exhaustive lifecycle logging to an AudioPlayer.
 *
 * @param {import('@discordjs/voice').AudioPlayer} player
 * @param {import('pino').Logger} log
 */
export function attachPlayerTelemetry(player, log) {
  let lastTransitionAt = Date.now();
  player.on('stateChange', (oldState, newState) => {
    const now = Date.now();
    const elapsedMs = now - lastTransitionAt;
    lastTransitionAt = now;
    log.info(
      {
        from: oldState.status,
        to: newState.status,
        elapsedMs,
        playbackDurationMs: newState.playbackDuration,
        missedFrames: newState.resource?.audioPlayer?.checkPlayable === undefined
          ? undefined
          : undefined,
      },
      'audio: player state change',
    );
  });
  player.on('debug', (msg) => log.debug({ msg }, 'audio: player debug'));
  player.on('error', (err) => {
    log.error(
      {
        err: err?.message,
        stack: err?.stack,
        resourceMeta: err?.resource?.metadata,
      },
      'audio: player error',
    );
  });
  for (const status of Object.values(AudioPlayerStatus)) {
    player.on(status, () => log.debug({ status }, `audio: status event ${status}`));
  }
}

export { describeNetworking, describeConnState };
