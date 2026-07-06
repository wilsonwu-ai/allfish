type Props = {
  value: number;
  size?: number;
  interactive?: boolean;
  onChange?: (v: number) => void;
};

export default function Stars({ value, size = 16, interactive, onChange }: Props) {
  const stars = [1, 2, 3, 4, 5];
  return (
    <span className="stars" role={interactive ? 'radiogroup' : 'img'} aria-label={`${value} out of 5 stars`}>
      {stars.map((n) => {
        const filled = n <= value;
        const star = (
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
            fill={filled ? '#f59e0b' : 'none'} stroke={filled ? '#f59e0b' : '#cbd5e1'} strokeWidth="1.8">
            <path d="M12 2l2.9 6.3 6.9.7-5.1 4.7 1.4 6.8L12 17.8 5.9 21.2l1.4-6.8L2.2 9.7l6.9-.7z" strokeLinejoin="round" />
          </svg>
        );
        return interactive ? (
          <button key={n} type="button" className="star-btn" aria-label={`${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={filled} onClick={() => onChange?.(n)}>{star}</button>
        ) : <span key={n} className="star-static">{star}</span>;
      })}
    </span>
  );
}
