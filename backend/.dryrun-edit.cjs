const fs=require('fs');
function rep(p,a,b){let s=fs.readFileSync(p,'utf8');if(!s.includes(a)){console.error('MISSING in '+p+': '+a.slice(0,60));process.exit(1)}s=s.replace(a,()=>b);fs.writeFileSync(p,s)}
rep('src/services/voip/contract.ts',`  machineDetection?: boolean;
}`,`  machineDetection?: boolean;
  /** R305: the provider ends the call by itself after this many seconds (fraud: a call cannot run for ever). Default none. */
  maxDurationSeconds?: number;
}`);
rep('src/services/voip/contract.ts',`  currency: string;
}

export interface VoipFetchUsageInput`,`  currency: string;
  /**
   * R305: which leg of a bridged call this record is. 'agent' = the leg to the agent (their app or phone), never
   * counted as customer minutes; 'customer' = the leg a customer is on; 'dial' = a child leg whose meaning depends on
   * its parent (a child of an inbound call is the agent leg, a child of an outbound call is the customer leg).
   * Absent = 'customer' (one record per call, as the mock reports it).
   */
  leg?: 'agent' | 'customer' | 'dial';
  /** The parent call's id when the provider reports legs as separate calls. */
  parentCallId?: string | null;
}

export interface VoipFetchUsageInput`);
rep('src/services/twilio-voice.ts','`<Response><Dial callerId="${escapeXml(options.from)}" timeout="${ring}" answerOnBridge="true"${recordAttrs}>`','`<Response><Dial callerId="${escapeXml(options.from)}" timeout="${ring}" answerOnBridge="true"${options.maxDurationSeconds ? ` timeLimit="${Math.floor(options.maxDurationSeconds)}"` : \'\'}${recordAttrs}>`');
rep('src/services/twilio-voice.ts',`    if (options.machineDetection) params.set('MachineDetection', 'Enable');
    const result = await this.createCall(params);
    return { ...result, direction: 'outbound'`,`    if (options.machineDetection) params.set('MachineDetection', 'Enable');
    if (options.maxDurationSeconds) params.set('TimeLimit', String(Math.floor(options.maxDurationSeconds)));
    const result = await this.createCall(params);
    return { ...result, direction: 'outbound'`);
rep('src/services/twilio-voice.ts',`        out.push({
          providerCallId: call.sid,
          direction: String(call.direction || '').startsWith('inbound') ? 'inbound' : 'outbound',`,`        const rawDirection = String(call.direction || '');
        out.push({
          providerCallId: call.sid,
          direction: rawDirection.startsWith('inbound') ? 'inbound' : 'outbound',
          // Legs (R305): the click-to-call parent is the agent leg; a dialled child is told apart by its parent's direction.
          leg: rawDirection === 'outbound-api' ? 'agent' : rawDirection === 'outbound-dial' ? 'dial' : 'customer',
          parentCallId: call.parent_call_sid || null,`);
rep('src/services/voip/mock-provider.ts',`  recordingStarted?: boolean;
}`,`  recordingStarted?: boolean;
  maxDurationSeconds?: number;
}`);
rep('src/services/voip/mock-provider.ts',`callbackBaseUrl: options.callbackBaseUrl, announcementUrl: options.announcementUrl });`,`callbackBaseUrl: options.callbackBaseUrl, announcementUrl: options.announcementUrl, maxDurationSeconds: options.maxDurationSeconds });`);
rep('src/services/voip/mock-provider.ts',`opts: { subAccountId?: string; direction?: 'inbound' | 'outbound'; startedAt?: string; cost?: number } = {},`,`opts: { subAccountId?: string; direction?: 'inbound' | 'outbound'; startedAt?: string; cost?: number; currency?: string; to?: string; from?: string; leg?: 'agent' | 'customer' | 'dial'; parentCallId?: string } = {},`);
