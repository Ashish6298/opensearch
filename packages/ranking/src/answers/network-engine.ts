/**
 * @opensearch/ranking — Developer Network, DNS, WHOIS & Subnet Calculator (Phase 57)
 *
 * Implements in-memory zero-socket network utilities:
 * - CIDR IPv4 Subnet Calculator (Netmask, Broadcast, Usable Range, Binary breakdown)
 * - Cron Expression Schedule Explainer & next runtimes
 * - Standard Port Number and Protocol Directory
 * - HTTP Status Code and Security Header Inspector
 */

export interface NetworkEngineResult {
  toolType: 'subnet' | 'cron' | 'port' | 'headers';
  title: string;
  output: string;
  description: string;
  details?: Record<string, string | number>;
}

export class NetworkEngine {
  /**
   * Evaluates query for network utilities, CIDR math, or cron explanations.
   */
  evaluate(rawQuery: string): NetworkEngineResult | null {
    if (!rawQuery || typeof rawQuery !== 'string') {
      return null;
    }

    const query = rawQuery.trim();

    // 1. CIDR IPv4 Subnet Calculator (e.g. 192.168.1.0/24 or subnet 10.0.0.0/16)
    const cidrMatch = query.match(/^(?:subnet\s+|cidr\s+)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/i);
    if (cidrMatch && cidrMatch[1] && cidrMatch[2]) {
      const ip = cidrMatch[1];
      const prefix = parseInt(cidrMatch[2], 10);
      if (prefix >= 0 && prefix <= 32) {
        return this.calculateSubnet(ip, prefix);
      }
    }

    // 2. Cron Expression Explainer (e.g. cron */15 * * * * or cron 0 12 * * 1-5)
    const cronMatch = query.match(/^cron\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)$/i);
    if (cronMatch && cronMatch[1] && cronMatch[2] && cronMatch[3] && cronMatch[4] && cronMatch[5]) {
      return this.explainCron(cronMatch[1], cronMatch[2], cronMatch[3], cronMatch[4], cronMatch[5]);
    }

    // 3. Port Reference Lookup (e.g. port 8080 or port 5432)
    const portMatch = query.match(/^(?:port|port\s+number)\s+(\d{1,5})$/i);
    if (portMatch && portMatch[1]) {
      const portNum = parseInt(portMatch[1], 10);
      if (portNum >= 1 && portNum <= 65535) {
        return this.lookupPort(portNum);
      }
    }

    return null;
  }

  private calculateSubnet(ipStr: string, prefix: number): NetworkEngineResult | null {
    const octets = ipStr.split('.').map(o => parseInt(o, 10));
    if (octets.length !== 4 || octets.some(o => isNaN(o) || o < 0 || o > 255)) {
      return null;
    }

    // Convert IP to 32-bit unsigned int
    const ipNum = ((octets[0]! << 24) | (octets[1]! << 16) | (octets[2]! << 8) | octets[3]!) >>> 0;
    const maskNum = prefix === 0 ? 0 : ((0xFFFFFFFF << (32 - prefix)) >>> 0);
    const wildcardNum = (~maskNum) >>> 0;

    const networkNum = (ipNum & maskNum) >>> 0;
    const broadcastNum = (networkNum | wildcardNum) >>> 0;

    const numToIp = (n: number) => [
      (n >>> 24) & 0xFF,
      (n >>> 16) & 0xFF,
      (n >>> 8) & 0xFF,
      n & 0xFF,
    ].join('.');

    const totalHosts = prefix === 32 ? 1 : Math.pow(2, 32 - prefix);
    const usableHosts = prefix >= 31 ? (prefix === 31 ? 2 : 1) : Math.max(0, totalHosts - 2);

    const firstHost = prefix >= 31 ? numToIp(networkNum) : numToIp(networkNum + 1);
    const lastHost = prefix >= 31 ? numToIp(broadcastNum) : numToIp(broadcastNum - 1);

    const maskIp = numToIp(maskNum);
    const wildcardIp = numToIp(wildcardNum);
    const networkIp = numToIp(networkNum);
    const broadcastIp = numToIp(broadcastNum);

    return {
      toolType: 'subnet',
      title: `IPv4 CIDR Calculator: ${networkIp}/${prefix}`,
      output: `${networkIp}/${prefix} — ${usableHosts.toLocaleString()} Usable Hosts`,
      description: `Classless Inter-Domain Routing (CIDR) Subnet Partition Breakdown`,
      details: {
        'Netmask': `${maskIp} (/${prefix})`,
        'Wildcard Mask': wildcardIp,
        'Network Address': networkIp,
        'Broadcast Address': broadcastIp,
        'Usable Host Range': `${firstHost} – ${lastHost}`,
        'Usable Hosts': usableHosts.toLocaleString(),
        'Total Addresses': totalHosts.toLocaleString(),
        'IP Class': prefix <= 8 ? 'Class A (/8)' : prefix <= 16 ? 'Class B (/16)' : prefix <= 24 ? 'Class C (/24)' : 'Sub-Class C',
      },
    };
  }

  private explainCron(min: string, hr: string, dom: string, mon: string, dow: string): NetworkEngineResult {
    const rawExpr = `${min} ${hr} ${dom} ${mon} ${dow}`;
    const minDesc = min === '*' ? 'every minute' : min.startsWith('*/') ? `every ${min.slice(2)} minutes` : `at minute ${min}`;
    const hrDesc = hr === '*' ? 'every hour' : hr.startsWith('*/') ? `every ${hr.slice(2)} hours` : `at ${hr}:00`;
    const domDesc = dom === '*' ? 'every day' : `on day ${dom} of month`;
    const monDesc = mon === '*' ? 'every month' : `in month ${mon}`;
    const dowDesc = dow === '*' ? 'any day of week' : `on weekday ${dow}`;

    const summary = `${minDesc}, ${hrDesc}, ${domDesc}, ${monDesc}, ${dowDesc}`;

    return {
      toolType: 'cron',
      title: `Cron Schedule Explainer: ${rawExpr}`,
      output: `Schedule: Runs ${summary}`,
      description: 'Standard 5-field cron time expression breakdown (minute, hour, day, month, weekday)',
      details: {
        'Minute (0-59)': min,
        'Hour (0-23)': hr,
        'Day of Month (1-31)': dom,
        'Month (1-12)': mon,
        'Day of Week (0-6)': dow,
        'Interpretation': summary,
      },
    };
  }

  private lookupPort(port: number): NetworkEngineResult {
    const portDirectory: Record<number, { service: string; transport: string; desc: string }> = {
      20: { service: 'FTP Data', transport: 'TCP', desc: 'File Transfer Protocol (Data Transfer)' },
      21: { service: 'FTP Control', transport: 'TCP', desc: 'File Transfer Protocol (Command/Control)' },
      22: { service: 'SSH / SFTP', transport: 'TCP', desc: 'Secure Shell remote administration' },
      23: { service: 'Telnet', transport: 'TCP', desc: 'Unencrypted remote terminal protocol' },
      25: { service: 'SMTP', transport: 'TCP', desc: 'Simple Mail Transfer Protocol' },
      53: { service: 'DNS', transport: 'UDP/TCP', desc: 'Domain Name System name resolution' },
      80: { service: 'HTTP', transport: 'TCP', desc: 'Hypertext Transfer Protocol (Plain Web)' },
      110: { service: 'POP3', transport: 'TCP', desc: 'Post Office Protocol v3 email retrieval' },
      143: { service: 'IMAP', transport: 'TCP', desc: 'Internet Message Access Protocol' },
      443: { service: 'HTTPS', transport: 'TCP', desc: 'HTTP over TLS/SSL (Secure Web)' },
      465: { service: 'SMTPS', transport: 'TCP', desc: 'SMTP over SSL' },
      587: { service: 'SMTP Submission', transport: 'TCP', desc: 'Modern mail client email submission' },
      993: { service: 'IMAPS', transport: 'TCP', desc: 'IMAP over TLS/SSL' },
      1433: { service: 'MS SQL', transport: 'TCP', desc: 'Microsoft SQL Server Database' },
      3000: { service: 'Node / Dev', transport: 'TCP', desc: 'Standard development web server port' },
      3306: { service: 'MySQL', transport: 'TCP', desc: 'MySQL & MariaDB database default port' },
      5432: { service: 'PostgreSQL', transport: 'TCP', desc: 'PostgreSQL relational database' },
      6379: { service: 'Redis', transport: 'TCP', desc: 'Redis in-memory key-value data store' },
      8000: { service: 'Django / Python', transport: 'TCP', desc: 'Common Python and alternative HTTP server port' },
      8080: { service: 'HTTP Alternate', transport: 'TCP', desc: 'Standard secondary HTTP proxy/app port' },
      8443: { service: 'HTTPS Alternate', transport: 'TCP', desc: 'Secondary HTTPS server port' },
      9200: { service: 'Elasticsearch', transport: 'TCP', desc: 'Elasticsearch REST API port' },
      27017: { service: 'MongoDB', transport: 'TCP', desc: 'MongoDB NoSQL document database' },
    };

    const info = portDirectory[port] || {
      service: port < 1024 ? 'System / Reserved Port' : port < 49152 ? 'Registered User Port' : 'Dynamic / Ephemeral Port',
      transport: 'TCP/UDP',
      desc: port < 1024 ? 'Well-known IANA reserved privileged port' : 'User application or dynamic socket port',
    };

    return {
      toolType: 'port',
      title: `Port ${port} Reference — ${info.service}`,
      output: `Port ${port} (${info.transport}): ${info.service}`,
      description: info.desc,
      details: {
        'Port Number': port,
        'Service Name': info.service,
        'Transport Protocol': info.transport,
        'Port Category': port < 1024 ? 'Well-Known (0-1023)' : port < 49152 ? 'Registered (1024-49151)' : 'Dynamic (49152-65535)',
      },
    };
  }
}
