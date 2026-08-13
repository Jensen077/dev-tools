import { useCallback, useEffect, useState } from "react";
import forge from "node-forge";
import { useAppStore } from "../../store/app";
import { useApplyHistory, useHistoryStore } from "../../store/history";
import { useSaveDraft } from "../../hooks/useSaveDraft";
import { useToastStore } from "../../store/toast";
import { ToolHistory } from "../../components/ToolHistory";
import { ResizableSplit } from "../../components/ResizableSplit";
import "../tool.css";

type KeySize = 512 | 1024 | 2048;
type KeyType = "public" | "private";
type CipherMode = "RSA" | "PKCS1" | "OAEP";

/** ArrayBuffer -> Base64 */
function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

/** Base64 -> Uint8Array */
function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function generateRsaKeyPair(size: KeySize) {
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: size, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-1" },
    true, ["encrypt", "decrypt"],
  );
  const spki = await crypto.subtle.exportKey("spki", keyPair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  return { publicKeyB64: bufToBase64(spki), privateKeyB64: bufToBase64(pkcs8) };
}

/** forge key from Base64 DER */
function forgeKeyFromB64(keyB64: string, isPublic: boolean) {
  const binaryStr = atob(keyB64.replace(/\s/g, ""));
  const asn1 = forge.asn1.fromDer(binaryStr);
  return isPublic ? forge.pki.publicKeyFromAsn1(asn1) : forge.pki.privateKeyFromAsn1(asn1);
}

/** PKCS1 v1.5 Type 1 padding (for private key encrypt) */
function pkcs1PadType1(data: string, keyByteLen: number): string {
  const padLen = keyByteLen - data.length - 3;
  let pad = "\x00\x01";
  for (let i = 0; i < padLen; i++) pad += "\xff";
  pad += "\x00";
  return pad + data;
}

/** Strip PKCS1 v1.5 Type 1 padding */
function pkcs1UnpadType1(padded: string): string {
  const idx = padded.indexOf("\x00", 1);
  if (idx < 0) throw new Error("Invalid padding");
  return padded.slice(idx + 1);
}

/** Private key encrypt via raw RSA (m^d mod n) with PKCS1 type 1 padding */
function privateKeyEncrypt(privKey: forge.pki.rsa.PrivateKey, data: string): string {
  const keyLen = Math.ceil(privKey.n.bitLength() / 8);
  const padded = pkcs1PadType1(data, keyLen);
  const hex = forge.util.bytesToHex(padded);
  const bi = new forge.jsbn.BigInteger(hex, 16);
  const enc = bi.modPow(privKey.d, privKey.n);
  let encHex = enc.toString(16);
  if (encHex.length % 2) encHex = "0" + encHex;
  return forge.util.hexToBytes(encHex);
}

/** Public key decrypt via raw RSA (c^e mod n) then strip PKCS1 type 1 padding */
function publicKeyDecrypt(pubKey: forge.pki.rsa.PublicKey, cipherBytes: string): string {
  const hex = forge.util.bytesToHex(cipherBytes);
  const bi = new forge.jsbn.BigInteger(hex, 16);
  const dec = bi.modPow(pubKey.e, pubKey.n);
  let decHex = dec.toString(16);
  if (decHex.length % 2) decHex = "0" + decHex;
  const padded = forge.util.hexToBytes(decHex);
  return pkcs1UnpadType1(padded);
}

async function rsaEncrypt(keyB64: string, keyType: KeyType, plaintext: string, mode: CipherMode): Promise<string> {
  const isPublic = keyType === "public";
  const fk = forgeKeyFromB64(keyB64, isPublic);

  if (mode === "OAEP") {
    // OAEP via Web Crypto（仅公钥加密/私钥解密）
    if (!crypto.subtle) throw new Error("crypto.subtle 不可用，需要 HTTPS 或 localhost");
    if (isPublic) {
      const der = base64ToUint8(keyB64).buffer;
      const ck = await crypto.subtle.importKey("spki", der, { name: "RSA-OAEP", hash: "SHA-1" }, false, ["encrypt"]);
      const enc = new TextEncoder().encode(plaintext);
      const cipher = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, ck, enc);
      return bufToBase64(cipher);
    } else {
      // 私钥加密用 raw RSA (m^d mod n)
      const bytes = forge.util.encodeUtf8(plaintext);
      const encrypted = privateKeyEncrypt(fk as forge.pki.rsa.PrivateKey, bytes);
      return btoa(encrypted);
    }
  } else {
    // RSA (no padding) 和 PKCS1 都用 forge
    const scheme = mode === "PKCS1" ? "RSAES-PKCS1-V1_5" : "RAW";
    const bytes = forge.util.encodeUtf8(plaintext);
    if (isPublic) {
      const encrypted = (fk as forge.pki.rsa.PublicKey).encrypt(bytes, scheme);
      return btoa(encrypted);
    } else {
      // 私钥加密用 raw RSA
      const bytes = forge.util.encodeUtf8(plaintext);
      const encrypted = privateKeyEncrypt(fk as forge.pki.rsa.PrivateKey, bytes);
      return btoa(encrypted);
    }
  }
}

async function rsaDecrypt(keyB64: string, keyType: KeyType, ciphertextB64: string, mode: CipherMode): Promise<string> {
  const isPublic = keyType === "public";
  const fk = forgeKeyFromB64(keyB64, isPublic);

  if (mode === "OAEP") {
    if (!crypto.subtle) throw new Error("crypto.subtle 不可用，需要 HTTPS 或 localhost");
    if (!isPublic) {
      const der = base64ToUint8(keyB64).buffer;
      const ck = await crypto.subtle.importKey("pkcs8", der, { name: "RSA-OAEP", hash: "SHA-1" }, false, ["decrypt"]);
      const cipher = base64ToUint8(ciphertextB64);
      const plain = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, ck, cipher);
      return new TextDecoder().decode(plain);
    } else {
      // 公钥解密用 raw RSA (c^e mod n)
      const encrypted = atob(ciphertextB64.replace(/\s/g, ""));
      const decrypted = publicKeyDecrypt(fk as forge.pki.rsa.PublicKey, encrypted);
      return forge.util.decodeUtf8(decrypted);
    }
  } else {
    const scheme = mode === "PKCS1" ? "RSAES-PKCS1-V1_5" : "RAW";
    const encrypted = atob(ciphertextB64.replace(/\s/g, ""));
    if (isPublic) {
      // 公钥解密用 raw RSA
      const decrypted = publicKeyDecrypt(fk as forge.pki.rsa.PublicKey, encrypted);
      return forge.util.decodeUtf8(decrypted);
    } else {
      const decrypted = (fk as forge.pki.rsa.PrivateKey).decrypt(encrypted, scheme);
      return forge.util.decodeUtf8(decrypted);
    }
  }
}

const KEY_SIZES: { value: KeySize; label: string }[] = [
  { value: 512, label: "512 位" },
  { value: 1024, label: "1024 位" },
  { value: 2048, label: "2048 位" },
];

const CIPHER_MODES: { value: CipherMode; label: string }[] = [
  { value: "RSA", label: "RSA" },
  { value: "PKCS1", label: "RSA/ECB/PKCS1Padding" },
  { value: "OAEP", label: "RSA/ECB/OAEPWithSHA-1AndMGF1Padding" },
];

export function Rsa() {
  const d = useAppStore((s) => s.drafts["rsa"]) as Record<string, unknown> | undefined;

  // 密钥生成
  const [keySize, setKeySize] = useState<KeySize>(() => (d?.keySize as KeySize) ?? 2048);
  const [publicKey, setPublicKey] = useState((d?.publicKey as string) ?? "");
  const [privateKey, setPrivateKey] = useState((d?.privateKey as string) ?? "");

  // 加密
  const [encInput, setEncInput] = useState((d?.encInput as string) ?? "");
  const [encKey, setEncKey] = useState((d?.encKey as string) ?? "");
  const [encKeyType, setEncKeyType] = useState<KeyType>(() => (d?.encKeyType as KeyType) ?? "public");
  const [encMode, setEncMode] = useState<CipherMode>(() => (d?.encMode as CipherMode) ?? "PKCS1");
  const [encOutput, setEncOutput] = useState("");

  // 解密
  const [decInput, setDecInput] = useState((d?.decInput as string) ?? "");
  const [decKey, setDecKey] = useState((d?.decKey as string) ?? "");
  const [decKeyType, setDecKeyType] = useState<KeyType>(() => (d?.decKeyType as KeyType) ?? "private");
  const [decMode, setDecMode] = useState<CipherMode>(() => (d?.decMode as CipherMode) ?? "PKCS1");
  const [decOutput, setDecOutput] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const addHistory = useHistoryStore((s) => s.addHistory);
  const showToast = useToastStore((s) => s.showToast);

  useApplyHistory("rsa", (p) => {
    if (p.publicKey) setPublicKey(p.publicKey);
    if (p.privateKey) setPrivateKey(p.privateKey);
    if (p.encInput !== undefined) setEncInput(p.encInput);
    if (p.decInput !== undefined) setDecInput(p.decInput);
  });

  const generate = useCallback(async () => {
    setError(null); setBusy(true);
    try {
      const keys = await generateRsaKeyPair(keySize);
      setPublicKey(keys.publicKeyB64);
      setPrivateKey(keys.privateKeyB64);
      // 自动填充到加密/解密的密钥框
      setEncKey(keys.publicKeyB64);
      setDecKey(keys.privateKeyB64);
      addHistory({ toolId: "rsa", toolName: "RSA", action: `生成 ${keySize} 位密钥对`, payload: { publicKey: keys.publicKeyB64, privateKey: keys.privateKeyB64 } });
      showToast(`已生成 ${keySize} 位 RSA 密钥对`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }, [keySize, addHistory, showToast]);

  const doEncrypt = useCallback(async () => {
    if (!encKey || !encInput) return;
    setError(null); setEncOutput(""); setBusy(true);
    try { setEncOutput(await rsaEncrypt(encKey, encKeyType, encInput, encMode)); }
    catch (e) { setError(`加密失败: ${e instanceof Error ? (e.message || e.name) : String(e)}`); }
    finally { setBusy(false); }
  }, [encKey, encKeyType, encInput, encMode]);

  const doDecrypt = useCallback(async () => {
    if (!decKey || !decInput) return;
    setError(null); setDecOutput(""); setBusy(true);
    try { setDecOutput(await rsaDecrypt(decKey, decKeyType, decInput, decMode)); }
    catch (e) { setError(`解密失败: ${e instanceof Error ? (e.message || e.name) : String(e)}`); }
    finally { setBusy(false); }
  }, [decKey, decKeyType, decInput, decMode]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => { setPublicKey(""); setPrivateKey(""); }, [keySize]);

  useSaveDraft("rsa", { keySize, publicKey, privateKey, encInput, encKey, encKeyType, encMode, decInput, decKey, decKeyType, decMode });

  const copyText = async (text: string, label: string) => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); showToast(`已复制${label}`); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  /** 密钥类型 + 密码类型 选择行 */
  function OptionsRow({ keyType, setKeyType, mode, setMode, name }: {
    keyType: KeyType; setKeyType: (t: KeyType) => void; mode: CipherMode; setMode: (m: CipherMode) => void; name: string;
  }) {
    return (
      <div className="rsa-options-row">
        <span className="rsa-label">密钥类型：</span>
        <label className="algo-chip"><input type="radio" name={name + "-kt"} checked={keyType === "public"} onChange={() => setKeyType("public")} /> 公钥</label>
        <label className="algo-chip"><input type="radio" name={name + "-kt"} checked={keyType === "private"} onChange={() => setKeyType("private")} /> 私钥</label>
        <span style={{ width: 12 }} />
        <span className="rsa-label">密码类型：</span>
        <select className="rsa-select" value={mode} onChange={(e) => setMode(e.target.value as CipherMode)}>
          {CIPHER_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>
    );
  }

  return (
    <div className="tool-page rsa-page">
      <div className="toolbar">
        <span className="rsa-section-title">RSA 密钥生成与加解密</span>
        <span className="spacer" />
        <ToolHistory toolId="rsa" />
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* 密钥生成区 */}
      <div className="toolbar">
        {KEY_SIZES.map((s) => (
          <label key={s.value} className="algo-chip">
            <input type="radio" name="keysize" checked={keySize === s.value} onChange={() => setKeySize(s.value)} /> {s.label}
          </label>
        ))}
        <button className="btn btn-primary" onClick={generate} disabled={busy}>{busy ? "生成中…" : "生成密钥对"}</button>
        <span className="spacer" />
        <button className="btn" onClick={() => { setPublicKey(""); setPrivateKey(""); setEncKey(""); setDecKey(""); }}>清空</button>
      </div>

      <ResizableSplit
        style={{ flex: "0 0 200px" }}
        left={
          <div className="pane">
            <div className="pane-title">公钥（X.509 SPKI · Base64）{publicKey && <button className="btn btn-sm" onClick={() => copyText(publicKey, "公钥")}>复制</button>}</div>
            <textarea className="text-area" value={publicKey} readOnly placeholder="点击「生成密钥对」生成 RSA 公钥…" />
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">私钥（PKCS#8 · Base64）{privateKey && <button className="btn btn-sm" onClick={() => copyText(privateKey, "私钥")}>复制</button>}</div>
            <textarea className="text-area" value={privateKey} readOnly placeholder="点击「生成密钥对」生成 RSA 私钥…" />
          </div>
        }
      />

      {/* 加密 + 解密 左右并排 */}
      <ResizableSplit
        style={{ flex: "1 1 0%" }}
        left={
          <div className="pane">
            <div className="pane-title">RSA 加密</div>

            <div className="rsa-label">输入要加密的纯文本</div>
            <textarea className="text-area rsa-fixed-area" value={encInput} onChange={(e) => setEncInput(e.target.value)} placeholder="输入需要加密的文本…" />

            <div className="rsa-label">输入公钥/私钥（Base64）</div>
            <textarea className="text-area rsa-key-area" value={encKey} onChange={(e) => setEncKey(e.target.value)} placeholder="粘贴 RSA 密钥（Base64）…" />

            <OptionsRow keyType={encKeyType} setKeyType={setEncKeyType} mode={encMode} setMode={setEncMode} name="enc" />

            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" onClick={doEncrypt} disabled={busy || !encKey || !encInput}>{busy ? "加密中…" : "加密"}</button>
              {encOutput && <button className="btn" onClick={() => copyText(encOutput, "密文")}>复制密文</button>}
            </div>

            <div className="rsa-label" style={{ marginTop: 8 }}>加密输出（Base64）</div>
            <textarea className="text-area rsa-fixed-area" value={encOutput} readOnly placeholder="加密结果将显示在此处…" />
          </div>
        }
        right={
          <div className="pane">
            <div className="pane-title">RSA 解密</div>

            <div className="rsa-label">输入要解密的加密文本（Base64）</div>
            <textarea className="text-area rsa-fixed-area" value={decInput} onChange={(e) => setDecInput(e.target.value)} placeholder="粘贴密文（Base64）…" />

            <div className="rsa-label">输入公钥/私钥（Base64）</div>
            <textarea className="text-area rsa-key-area" value={decKey} onChange={(e) => setDecKey(e.target.value)} placeholder="粘贴 RSA 密钥（Base64）…" />

            <OptionsRow keyType={decKeyType} setKeyType={setDecKeyType} mode={decMode} setMode={setDecMode} name="dec" />

            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="btn btn-primary" onClick={doDecrypt} disabled={busy || !decKey || !decInput}>{busy ? "解密中…" : "解密"}</button>
              {decOutput && <button className="btn" onClick={() => copyText(decOutput, "明文")}>复制明文</button>}
            </div>

            <div className="rsa-label" style={{ marginTop: 8 }}>解密输出</div>
            <textarea className="text-area rsa-fixed-area" value={decOutput} readOnly placeholder="解密结果将显示在此处…" />
          </div>
        }
      />
    </div>
  );
}

