import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, LoaderCircle, PencilLine, RotateCcw } from 'lucide-react';
import { parseReceiptImage, receiptFileError, type ParseResult } from '../utils/receiptParser';
import Dialog from './Dialog';

export default function ReceiptImportSheet({onClose, onApply}: {
  onClose: () => void; onApply: (data: NonNullable<ParseResult['data']>) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  useEffect(() => () => {sequence.current++;request.current?.abort();}, []);
  useEffect(() => {
    if (!file) {setPreview('');return;}
    const url = URL.createObjectURL(file);setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function choose(next: File | undefined) {
    if (!next) return;
    sequence.current++;request.current?.abort();setBusy(false);
    const errorMessage = receiptFileError(next);
    setFile(errorMessage ? null : next);
    setResult(errorMessage ? {status: 'FAILED', errorMessage} : null);
    if (!errorMessage) void analyze(next);
  }
  async function analyze(selected: File) {
    request.current?.abort();
    const id = ++sequence.current;
    const controller = new AbortController();request.current = controller;
    setBusy(true);setResult(null);
    const next = await parseReceiptImage(selected, {signal: controller.signal});
    if (sequence.current !== id) return;
    setBusy(false);
    if (next.status !== 'FAILED' && next.data) {onApply(next.data);return;}
    setResult(next);
  }
  return <Dialog title="영수증 캡처로 입력하기" onClose={onClose} className="receipt-sheet">
    <p className="mt-2 text-sm leading-relaxed text-stone-500">사진 한 장으로 가볍게 기록해요.<br/>이미지를 선택하면 분석 후 폼을 자동으로 채워요.</p>
    <p className="mt-3 text-xs leading-relaxed text-stone-500">선택한 이미지는 Google Gemini로 전송돼요. 카드번호 등 불필요한 정보는 가려 주세요. 앱에는 이미지가 저장되지 않아요.</p>
    <div className="mt-5 rounded-2xl border border-dashed border-[#cdd6bf] bg-[#f7f8f1] p-4">
      {preview ? <img src={preview} alt="선택한 결제 이미지 미리보기" className="mx-auto mb-4 max-h-40 rounded-lg object-contain"/> : <Camera className="mx-auto mb-3 text-forest" size={32}/>}
      <label className="button-secondary relative mx-auto w-fit cursor-pointer focus-within:ring-2 focus-within:ring-forest">
        <ImagePlus size={16}/>{file ? '다른 이미지 선택' : '결제 이미지 선택'}
        <input aria-label="결제 이미지 선택" className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="file" accept="image/*" onChange={event => {choose(event.target.files?.[0]);event.target.value = '';}}/>
      </label>
      <p className="mt-2 text-center text-[11px] text-stone-500">JPG · PNG · WEBP / 최대 6MB / 결제 한 건</p>
    </div>
    <div aria-live="polite" aria-atomic="true">
      {busy && <div className="mt-5 flex items-center gap-3 rounded-xl bg-[#edf1e4] p-4 text-sm text-forest" role="status"><LoaderCircle size={22} className="shrink-0 animate-spin motion-reduce:animate-none"/><div><strong>영수증을 꼼꼼히 읽고 있어요...</strong><p className="mt-1 text-xs">잠깐만 기다려 주세요. 직접 입력으로 바꿔도 괜찮아요.</p></div></div>}
      {result?.status === 'FAILED' && <div role="alert" className="mt-5 rounded-xl bg-[#faf0e6] p-4"><p className="text-sm font-semibold">괜찮아요, 직접 적어도 같은 기록이에요.</p><p className="mt-2 text-sm leading-relaxed text-stone-600">{result.errorMessage}</p><p className="mt-2 text-xs text-stone-500">작성하던 내용은 그대로 남아 있어요.</p></div>}
    </div>
    <div className="mt-5 flex flex-wrap gap-2">
      <button type="button" className="button-secondary flex-1" onClick={onClose}><PencilLine size={15}/>직접 입력하기</button>
      {!busy && file && result?.status === 'FAILED' && <button type="button" className="button-primary flex-1" onClick={() => void analyze(file)}><RotateCcw size={15}/>다시 읽기</button>}
    </div>
  </Dialog>;
}
