import tls from "tls";

export interface SslInfo {
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysUntilExpiration: number | null;
  valid: boolean | null;
}

export async function fetchSslInfo(siteUrl: string): Promise<SslInfo | null> {
  try {
    const { hostname } = new URL(siteUrl);
    return await new Promise<SslInfo | null>((resolve) => {
      const socket = tls.connect(
        { host: hostname, port: 443, servername: hostname },
        () => {
          const cert = socket.getPeerCertificate();
          socket.end();
          if (!cert || Object.keys(cert).length === 0) {
            resolve(null);
            return;
          }
          const validFrom = cert.valid_from ? new Date(cert.valid_from) : null;
          const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
          const now = Date.now();
          let daysUntilExpiration: number | null = null;
          let valid: boolean | null = null;
          if (validTo && !isNaN(validTo.getTime())) {
            daysUntilExpiration = Math.ceil(
              (validTo.getTime() - now) / (1000 * 60 * 60 * 24)
            );
          }
          if (validFrom && validTo) {
            valid = now >= validFrom.getTime() && now <= validTo.getTime();
          }
          let issuer: string | null = null;
          if (cert.issuer) {
            const issuerObj = cert.issuer as Record<string, string>;
            issuer =
              issuerObj.O || issuerObj.CN || Object.values(issuerObj).join(", ");
          }
          resolve({
            issuer,
            validFrom: validFrom?.toISOString() ?? null,
            validTo: validTo?.toISOString() ?? null,
            daysUntilExpiration,
            valid,
          });
        }
      );
      socket.on("error", () => resolve(null));
      socket.setTimeout(10000, () => {
        socket.destroy();
        resolve(null);
      });
    });
  } catch {
    return null;
  }
}

