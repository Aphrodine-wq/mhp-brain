import type { PdfStyles, PdfView, PdfText, PdfImage } from "./types";
/**
 * MHP Section Divider Page - full-page centered section title.
 * Matches the template: MHP logo centered, large cyan title, subtitle, section number.
 */

interface MHPSectionDividerProps {
  sectionNumber: number;
  title: string;
  subtitle: string;
  logoSrc: string | null;
  s: PdfStyles;
  View: PdfView;
  Text: PdfText;
  Image: PdfImage;
}

export function MHPSectionDivider({
  sectionNumber,
  title,
  subtitle,
  logoSrc,
  s,
  View,
  Text,
  Image,
}: MHPSectionDividerProps) {
  return (
    <>
      <View style={s.dividerLogoContainer}>
        {logoSrc ? (
          <Image src={logoSrc} style={s.dividerLogo} />
        ) : null}
      </View>
      <Text style={s.dividerTitle}>{title}</Text>
      <Text style={s.dividerSubtitle}>{subtitle}</Text>
      <Text style={s.dividerSectionNumber}>Section {sectionNumber}</Text>
    </>
  );
}
