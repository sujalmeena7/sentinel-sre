import React, { useState } from 'react';
import { Radio, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const RAW_BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || '').trim().replace(/\/+$/, '');
const API_URL = RAW_BACKEND_URL || 'http://localhost:8000';

export default function TelemetryPanel() {
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const { webhookToken, rotateWebhookToken } = useAuth();
  const token = webhookToken || "YOUR_WEBHOOK_TOKEN";
  const webhookUrl = `${API_URL}/api/v1/telemetry/prometheus/${token}`;

  const curlCommand = `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{
    "receiver": "webhook",
    "status": "firing",
    "alerts": [
      {
        "status": "firing",
        "labels": {
          "alertname": "HighMemoryUsage",
          "service": "checkout-ui",
          "severity": "critical",
          "environment": "production"
        },
        "annotations": {
          "summary": "High memory usage detected",
          "description": "Pod memory usage is > 90%"
        }
      }
    ]
  }'`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      await rotateWebhookToken();
    } catch (e) {
      // error shown by caller
    } finally {
      setRotating(false);
    }
  };

  return (
    <div className="bg-surface-100 border border-accent-emerald/20 rounded-2xl p-6 relative overflow-hidden group hover:border-accent-emerald/40 transition-colors h-full flex flex-col">
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent-emerald/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
      
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center border border-accent-emerald/20">
          <Radio size={20} className="text-accent-emerald" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            Live Telemetry Ingestion
            <span className="text-[10px] uppercase tracking-wider bg-accent-emerald/10 text-accent-emerald px-2 py-0.5 rounded-full border border-accent-emerald/20">Active</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">Connect your cluster via Prometheus Webhook.</p>
        </div>
      </div>

      <div className="flex-1 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-medium text-slate-400">Webhook URL</label>
            <button
              onClick={handleRotate}
              disabled={rotating}
              className="flex items-center gap-1 text-[10px] text-accent-emerald hover:text-accent-emerald/80 transition-colors"
            >
              <RefreshCw size={10} className={rotating ? 'animate-spin' : ''} />
              {rotating ? 'Rotating…' : 'Regenerate token'}
            </button>
          </div>
          <div className="bg-surface-200 border border-white/5 rounded-lg px-3 py-2 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-nowrap">
            {webhookUrl}
          </div>
          {!webhookToken && (
            <p className="text-[10px] text-accent-amber mt-1">
              Token not found — register or regenerate to get a valid webhook URL.
            </p>
          )}
        </div>
        
        <div>
          <div className="flex items-center justify-between mb-1">
             <label className="block text-xs font-medium text-slate-400">Test Alert (cURL)</label>
             <button 
               onClick={copyToClipboard}
               className="flex items-center gap-1.5 text-xs text-accent-emerald hover:text-accent-emerald/80 transition-colors"
             >
               {copied ? <Check size={12} /> : <Copy size={12} />}
               {copied ? 'Copied!' : 'Copy'}
             </button>
          </div>
          <div className="bg-surface border border-white/5 rounded-lg p-3 text-[11px] font-mono text-slate-300 relative overflow-x-auto">
            <pre className="whitespace-pre-wrap">{curlCommand}</pre>
          </div>
        </div>
      </div>
      
      <div className="mt-4 pt-4 border-t border-white/5 text-xs text-slate-500 flex items-center gap-2">
        <ExternalLink size={12} />
        Alerts from the same service are grouped within a 15m window.
      </div>
    </div>
  );
}
