import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Radio, Copy, Check, ExternalLink } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function TelemetryPanel() {
  const [copied, setCopied] = useState(false);
  const webhookUrl = `${API_URL}/api/v1/telemetry/prometheus`;
  const token = process.env.NEXT_PUBLIC_TELEMETRY_TOKEN || "change-me-in-production";

  const curlCommand = `curl -X POST ${webhookUrl} \\
  -H "Authorization: Bearer ${token}" \\
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

  return (
    <div className="bg-surface-100 border border-accent-emerald/20 rounded-2xl p-6 relative overflow-hidden group hover:border-accent-emerald/40 transition-colors h-full flex flex-col">
      <div className="absolute top-0 right-0 w-64 h-64 bg-accent-emerald/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
      
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent-emerald/20 to-accent-cyan/20 flex items-center justify-center border border-accent-emerald/20">
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
          <label className="block text-xs font-medium text-slate-400 mb-1">Webhook URL</label>
          <div className="bg-surface-200 border border-white/5 rounded-lg px-3 py-2 text-sm font-mono text-slate-300 overflow-x-auto whitespace-nowrap">
            {webhookUrl}
          </div>
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
          <div className="bg-surface-900 border border-white/5 rounded-lg p-3 text-[11px] font-mono text-slate-300 relative overflow-x-auto">
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
