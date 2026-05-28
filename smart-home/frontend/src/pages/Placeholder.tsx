type Props = { title: string };

export default function Placeholder({ title }: Props) {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-800">{title}</h1>
      <p className="mt-2 text-slate-500">
        Цю сторінку буде реалізовано на наступних кроках дорожньої карти.
      </p>
    </div>
  );
}
