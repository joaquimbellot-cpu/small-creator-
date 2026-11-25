// About 1,900 common English words, written by hand for the pitch checker (no download, no licence issue).
// Use: a capitalised word that starts a sentence or a subject is ordinary when it is in this list, so "Introduction",
// "Quick" or "Following" are never read as a company name. An invented brand such as "Zentora" is not in it.
// Words that are mostly known as a company or product name (apple, amazon, square ...) are left out on purpose.
// Lower case only. A contraction is checked by the part before the apostrophe ("we're" -> "we"); "dont", "cant" and the like are listed.
const RAW = `
a about above accept across act action add address admit adult advice afford after afternoon again against age agency agent ago agree agreement ahead air all allow almost alone along already also although always am among amount an and angle another answer any anyone anything appear apply approach area argue arm around arrive art article as ask aspect assume at attack attention audience author available average avoid away
baby back bad bag ball bank bar base be beat beautiful because become bed before begin behavior behind believe benefit best better between beyond big bill billion bit black blue board body book born both box boy break bring brother brought build building business but buy by
call came camera can cannot capital car card care career carry case catch cause cell center central century certain certainly chair challenge chance change character charge check child choice choose church citizen city civil claim class clean clear clearly close coach cold collection college color come commercial common community company compare computer concern condition conference consider consumer contain continue control cost could country couple course court cover create crime cultural culture cup current customer cut
dark data date daughter day dead deal dear death debate decade decide decision deep defense degree democrat demonstrate department depend describe design despite detail determine develop development die difference different difficult dinner direction director discover discuss discussion disease do doctor dog door down draw dream drive drop during
each early east easy eat economic economy edge education effect effort eight either election else employee end energy enjoy enough enter entire environment especially establish even evening event ever every everybody everyone everything evidence exactly example executive exist expect experience expert explain eye
face fact factor fail fall family far fast father fear federal feel feeling few field fifth fight figure fill film final finally financial find fine finger finish fire firm first fish five floor fly focus follow food foot for force foreign forget form former forward four free friend from front full fund future
game garden gas general generation get girl give given glass go goal good government great green ground group grow growth guess gun guy
hair half hand hang happen happy hard have he head health hear heart heat heavy help her here herself high him himself his history hit hold home hope hospital hot hotel hour house how however huge human hundred husband
i idea identify if image imagine impact important improve in include including increase indeed indicate individual industry information inside instead institution interest interesting international interview into investment involve issue it item its itself
job join just
keep key kid kill kind kitchen know knowledge
land language large last late later laugh law lawyer lay lead leader learn least leave left leg legal less let letter level lie life light like likely line list listen little live local long look lose loss lot love low
machine magazine main maintain major majority make man manage management manager many market marriage material matter may maybe me mean measure media medical meet meeting member memory mention message method middle might military million mind minute miss mission model modern moment money month more morning most mother mouth move movement movie mr mrs much music must my myself
name nation national natural nature near nearly necessary need network never new news newspaper next nice night no none nor north not note nothing notice now number
occur of off offer office officer official often oh oil ok old on once one only onto open operation opportunity option or order organization other others our out outside over own owner
page pain painting paper parent part participant particular particularly partner party pass past patient pattern pay peace people per perform performance perhaps period person personal phone physical pick picture piece place plan plant play player point police policy political politics poor popular population position positive possible power practice prepare present president pressure pretty prevent price private probably problem process produce product production professional professor program project property protect prove provide public pull purpose push put
quality question quickly quite
race radio raise range rate rather reach read ready real reality realize really reason receive recent recently recognize record red reduce reflect region relate relationship religious remain remember remove report represent republican require research resource respond response responsibility rest result return reveal rich right rise risk road rock role room rule run
safe same save say scene school science scientist score sea season seat second section security see seek seem sell send senior sense series serious serve service set seven several sex sexual shake share she shoot short shot should shoulder show side sign significant similar simple simply since sing single sister sit site situation six size skill skin small smile so social society soldier some somebody someone something sometimes son song soon sort sound source south southern space speak special specific speech spend sport spring staff stage stand standard star start state statement station stay step still stock stop store story strategy street strong structure student study stuff style subject success successful such suddenly suffer suggest summer support sure surface system
table take talk task tax teach teacher team technology television tell ten tend term test than thank thanks that the their them themselves then theory there these they thing think third this those though thought thousand threat three through throughout throw thus time to today together tonight too top total tough toward town trade traditional training travel treat treatment tree trial trip trouble true truth try turn tv two type
under understand unit until up upon us use usually
value various very victim view violence visit voice vote
wait walk wall want war watch water way we weapon wear week weight well west western what whatever when where whether which while white who whole whom whose why wide wife will win wind window wish with within without woman wonder word work worker world worry would write writer wrong
yard yeah year yes yet you young your yourself
able accept access accord account achieve active actually additional adjust admire advance advertise affect agenda aim alert alike alive allowed alongside alter amazing ample annual anyway apart apparently appeal appreciate appropriate approve arrange arrival aside assist associate attend attract available award aware
background balance basic basically basis beauty beginning behalf belong bigger bit blank blend bold bonus bother bottom brand brief bright broad brought budget bunch busy button
calm campaign capture careful carefully catalog category celebrate certainly chain channel chapter charm cheap cheer choose circle clarity classic clip club collaborate collect combine comfortable comment commit complete completely complex concept concrete confirm connect connection consistent contact content context contract contribute convenient conversation cool copy corner correct count courage crazy creative creator crew critical crowd curious customer
daily dare deadline dedicated deliver demand depth detail digital direct directly disclose distance distinct doubt draft dramatic drive due duty
eager earn ease easily editor effective efficient effortless elegant emotion emphasize empty enable encourage engage engagement enhance ensure entertain entry equal equipment essential estimate ethic evaluate eventually exact excellent exchange excited exciting exclusive excuse exercise expand expense explore express extra extremely
fairly faith familiar famous fan fantastic fashion favorite feature feedback fellow fit fix flat flexible flow folks following forever formal forth fortunate found frame frankly freely fresh friendly fully fun function funny further
gain gap gather gear gentle genuine gift glad global glow grab grade grand grant grateful greet guide
habit handle happily hardly harm hello helpful hence hey hidden highlight highly hint hire honest honestly host however huge humble
ideal identity ignore immediate immediately impressive include income incredible indeed independent info inform initial inspire install instance intend intent interact intro introduce introduction invest invite involved
journey judge jump
keen knock known
label lack landscape large largely launch layer leading lean lesson lift limit link listing literally lively load locate lock logo looking loyal lucky
mainly manner margin mark mass master match matched matches mature meaningful meanwhile measure mention merely mild mind minor mix mood moreover motion mostly multiple mutual
narrow nearby neat needed neither nevertheless nobody normal normally notable noted nowadays
obvious obviously offering ongoing online opinion opposite organic original otherwise outcome outline overall overview
pace pack package paid pair panel partly passion patient pause perfect perfectly permit personally pitch plain planning platform plus pocket polite pool portion pose positive possibly post potential powerful practical praise pre precise predict prefer premium presence presentation preview previous previously primary prior priority privacy proceed profile progress promote proper properly proud provider publish purchase pure
quarter quick quiet quote
raw reaction reader readily recall receive recommend recover refer regard regarding regular regularly relax release relevant reliable rely remind remote repeat replace reply request reserve resolve respect restore retain reveal review reward ride roll round route routine
sample satisfied scale schedule scope screen search secret select selected selection sensitive separate sequence settle shape sharp shift shortly sight signal silent similarly sincerely sir skip slight slightly slow smart smooth solid solution solve somewhat sorry sounds spare spark speaking specifically speed spirit split spot spread stable steady stick stream strength stress strict strike strongly studio subscribe subscriber subscribers succeed sudden suit suitable summary super supply supporter supportive surely surprise surround survey sustain switch
tailor talent taste teaching tell tend tension thank thanks thoughtful thoughts tight tiny tip title tone tool topic touch tour track trend trust truly turn typical typically
ultimately unable unique unless unlike unlikely update upcoming upper urgent useful user usual utility
valid valuable variety vast version video viewer view visible vision visual vital volume
warm warmly warning wave website welcome whenever whereas wherever whichever widely willing wise wonderful worth worthwhile
yet yours
accurate adding adds advertising advertiser ads album alternative analytics anyone approach appreciated approved arrived asked assistant attached audio autumn
bag beginner benefit bike blog boost bridge browse bundle
cable cap carefully cartoon chat chosen clearly clips closer coffee collaboration collection combination commitment compact compare comparison concerned concise confident consistent consider considered content continue conversation cooking cost creating creation creators curated
data deliver delivered describe designed desk detailed developer device dedicated diverse download draft dropped
edit edited editing educational email embrace emphasis encourage ended enjoyable enjoyed entertaining episode equally especially essential ethical everyday evergreen exactly explained explaining
fair fairness familiar fashion fee feeling fewer fitness flexible folks followers follows footage format found founder freedom friendly fresh fully
gaming gadget gadgets gamers gaming gentle genuinely gladly goals gradually growing grown guidance
handmade hands helped helping helps highlights honest hosting hosts hours household
imagine impressed improving included includes inclusive incoming increasingly inspired inspiring interested introduced introducing invitation inviting involves
joined joining journey
kindly knowing knows
lately later layout learned learning lifestyle liked likes limited listed listening listeners lives longer longtime looked looks lovely
mail makers making manually matching maybe meant meets members mentioned mentions messages might mine minimal missing mobile moments monthly months motivated moved moves music
named names narrator needs newer newest nicely nine niche niches nothing noticed
offered offers officially older opened opens opportunities organized others outdoor outdoors overall owned
parents partners partnership partnerships passionate past patient peers personally photo photography pick picked picks placed places plans played playing plays pleased pleasure podcast point popular possibility practical preferred prepared presented presents pretty probably produced products promising proposal prospect proud provided provides publish published purpose
questions quickly quietly
rarely reached reaching reads reasons received recently recommended record reference refer related relevant remains replies replied reply report represent reputation require respond responded response responsible results returning reviews right rightly rising roles running
safely samples saying says scheduled seeing seen sees selected sending sends sent sense separate served services setting setup several shared sharing shows signed simple simply singer sized sizes skills slowly smaller solid solo somewhere soon sounded source speaking spoke started starting starts staying stays still stories storytelling strong stronger studio subscribed suggested suggestion suggests suited suits supporting supports surprised
tailored taking talked talking talks teams tech technical tells ten thanks thinking thinks thoughts thread tidy times tiny tips together told took touch towards tracked trained travels tried trusted trying tutorial tutorials
understand understood unusual updates used uses using usually
variety verified videos views viewers visited visiting
waiting wanted wants watched watching ways weekly welcome went whole wider wishes wonder worked working works worldwide writing written
yearly years yesterday
following followed previous prior quick quickly request requests hello hi dear greetings regards sincerely cheers thanks thank appreciate looking forward wanted wondering hoping hope sorry
we our ours us ourselves you yours yourselves they them theirs it its he she him her his hers
am is are was were be been being do does did done doing has have had having will would shall should can could may might must
and or but nor so yet for because since although though unless while whereas whether
please perhaps otherwise nonetheless besides currently ideally hopefully luckily firstly secondly lastly additionally furthermore therefore accordingly consequently generally naturally definitely absolutely apparently initially originally somewhat everyone everybody anybody nobody somebody someone anyone whoever whatever whichever nowhere anywhere everywhere somewhere sadly fortunately unfortunately happily gladly clearly obviously evidently seemingly supposedly allow allows allowed ask asking asks begin begins began bring brings call called calls check checked checks choose chose come comes coming consider decide decided decides discover discovered enjoy enjoys explain explains feel feels felt find finds follow follows forward get gets getting give gives gave given go goes going gone grow grows grew hear heard hears help helps helped hold holds keep keeps kept know knew known learn learns lead leads led let lets like liked likes look looks make makes made meet meets met need needs needed note noted notes offer offers open opens pick picks play plays put reach reach read reads run runs said say says see sees seen set share shares show shows shown start starts take takes took tell tells think thinks thought try tries tried turn use uses used want wants wanted watch watches work works worked write writes wrote
sponsor sponsors sponsored sponsorship sponsorships youtube smallfold gaming tech fitness finance travel education beauty music photo outdoors cooking diy
hope hoping thrilled delighted honored pleased grateful curious interested eager ready willing available open flexible easy simple quick brief short small big large huge tiny little new old young fresh recent latest current former later earlier
monday tuesday wednesday thursday friday saturday sunday january february march april june july august september october november december
morning afternoon evening tonight weekend week month year day today tomorrow yesterday
ok okay yes no maybe sure absolutely
based according regarding owing details
dont doesnt didnt wont cant isnt arent wasnt werent couldnt wouldnt shouldnt lets
`;
export const COMMON_WORDS: ReadonlySet<string> = new Set(RAW.split(/\s+/).filter(Boolean));
