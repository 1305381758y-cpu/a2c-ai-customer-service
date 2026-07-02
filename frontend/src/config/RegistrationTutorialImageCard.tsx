import { Upload } from "lucide-react";

import { AsyncButton } from "../ui/components.js";

export function RegistrationTutorialImageCard({
  imageUrl,
  file,
  onFileChange,
  onUpload,
}: {
  imageUrl?: string | boolean;
  file: File | null;
  onFileChange: (file: File | null) => void;
  onUpload: () => Promise<void>;
}) {
  return <div className="memory tutorial-upload-card">
    <div>
      <h3>注册教程图片</h3>
      <p>商户只需要上传图片。客户问“怎么注册”“我不会”“有教程吗”时，系统会自动把这张图发给客户。</p>
    </div>
    <div className="tutorial-upload-layout">
      <div className="tutorial-preview">
        {imageUrl ? <img src={String(imageUrl)} alt="注册教程图片预览" /> : <span>还未上传注册教程图片</span>}
      </div>
      <div className="tutorial-upload-actions">
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => onFileChange(event.target.files?.[0] || null)} />
        <AsyncButton disabled={!file} busyText="上传中..." onClick={onUpload}><Upload size={16}/>上传图片</AsyncButton>
        <small>{file ? `已选择：${file.name}` : "支持 PNG、JPG、WEBP、GIF；上传后会替换当前教程图。"}</small>
      </div>
    </div>
  </div>;
}
