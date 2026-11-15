import fullImage from './vice-city-home.jpg';
import desktopImage from './vice-city-home-1920.jpg';
import mobileImage from './vice-city-home-960.jpg';

export default function ViceCityBackdrop() {
  return (
    <div className="vice-city-backdrop" aria-hidden="true">
      <picture>
        <source media="(max-width: 760px)" srcSet={mobileImage}/>
        <source media="(min-width: 2200px)" srcSet={fullImage}/>
        <img src={desktopImage} alt="" fetchPriority="high" decoding="async"/>
      </picture>
    </div>
  );
}
