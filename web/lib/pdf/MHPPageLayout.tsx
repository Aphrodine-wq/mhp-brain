/**
 * MHP Page Layout - shared header/footer wrapper for every page.
 *
 * Header: MHP logo + "NORTH MS HOME PROS" left | estimate number + project desc right
 * Footer: "MHP-xxxx-xxx-xxx | Page X/Y" centered
 *
 * Usage: Wrap each <Page> content with <MHPPageHeader> and <MHPPageFooter> as fixed elements.
 */

interface MHPPageHeaderProps {
  estimateNumber: string;
  projectDesc: string;
  logoSrc: string | null;
  s: any;
  View: any;
  Text: any;
  Image: any;
}

export function MHPPageHeader({
  estimateNumber,
  projectDesc,
  logoSrc,
  s,
  View,
  Text,
  Image,
}: MHPPageHeaderProps) {
  return (
    <View style={s.pageHeader} fixed>
      {logoSrc ? (
        <Image src={logoSrc} style={s.pageHeaderLogo} />
      ) : null}
      <View>
        <Text style={s.pageHeaderCompany}>NORTH MS HOME PROS</Text>
        <Text style={s.pageHeaderMeta}>
          {estimateNumber}  |  {projectDesc}
        </Text>
      </View>
    </View>
  );
}

interface MHPPageFooterProps {
  estimateNumber: string;
  s: any;
  View: any;
  Text: any;
}

export function MHPPageFooter({ estimateNumber, s, View, Text }: MHPPageFooterProps) {
  return (
    <View style={s.pageFooter} fixed>
      <Text
        style={s.pageFooterText}
        render={({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `${estimateNumber}  |  Page ${pageNumber}/${totalPages}`
        }
      />
    </View>
  );
}
