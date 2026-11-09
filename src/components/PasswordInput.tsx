import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible,setVisible] = useState(false);
  return <><input {...props} type={visible ? 'text' : 'password'} /><button type="button" className="password-visibility" aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={visible} onClick={()=>setVisible(value=>!value)}>{visible ? <EyeOff aria-hidden="true"/> : <Eye aria-hidden="true"/>}</button></>;
}
