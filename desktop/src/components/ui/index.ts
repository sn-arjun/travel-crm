// Tier 1: Primitives
export { Button, buttonVariants } from './button';
export { Badge, badgeVariants } from './badge';
export { Avatar, AvatarImage, AvatarFallback } from './avatar';
export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from './card';
export { Input } from './input';
export { Textarea } from './textarea';
export { Label } from './label';
export { Separator } from './separator';
export { Checkbox } from './checkbox';
export { Switch } from './switch';
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip';
export { Skeleton } from './skeleton';
export { Spinner, spinnerVariants } from './spinner';
export { ScrollArea, ScrollBar } from './scroll-area';
export { Progress } from './progress';
export { Alert, AlertTitle, AlertDescription } from './alert';
export { EmptyState } from './empty-state';
export { FormField } from './form-field';
export { AspectRatio } from './aspect-ratio';

// Tier 2: Composites
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from './select';
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from './dropdown-menu';
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './dialog';
export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from './sheet';
export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from './popover';
export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';
export { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './accordion';
export { Collapsible, CollapsibleTrigger, CollapsibleContent } from './collapsible';
export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
} from './command';
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption } from './table';

// Tier 3: Added primitives (design-system baseline)
export { DataTable, VIRTUALIZE_THRESHOLD } from './data-table';
export type { DataTableProps, DataTableColumn } from './data-table';
export { Pagination } from './pagination';
export type { PaginationProps } from './pagination';
export { PageHeader } from './page-header';
export type { PageHeaderProps, Breadcrumb } from './page-header';
export { SectionCard } from './section-card';
export type { SectionCardProps } from './section-card';
export { Stat } from './stat';
export type { StatProps } from './stat';
export { Toolbar } from './toolbar';
export type { ToolbarProps } from './toolbar';
export { ConfirmDialog, useConfirm } from './confirm-dialog';
export type { ConfirmDialogProps } from './confirm-dialog';
export { FileDropzone } from './file-dropzone';
export type { FileDropzoneProps } from './file-dropzone';
export { Timeline } from './timeline';
export type { TimelineProps, TimelineItem } from './timeline';
export { Tag, tagVariants } from './tag';
export type { TagProps } from './tag';
export { Kbd } from './kbd';
export type { KbdProps } from './kbd';
export { SplitButton } from './split-button';
export type { SplitButtonProps, SplitButtonAction } from './split-button';
export { LineChart, AreaChart, BarChart, PieChart } from './chart';
export type { BaseChartProps, PieChartProps, ChartSeries } from './chart';

// Pre-existing primitives previously missing from this barrel
export { Combobox } from './combobox';
export type { ComboboxOption } from './combobox';
export { CommandPalette } from './command-palette';
export { DatePicker } from './date-picker';
export { CurrencyInput } from './currency-input';
export { PhoneInput } from './phone-input';
export { AddressAutocomplete } from './address-autocomplete';
export { RichTextEditor } from './rich-text-editor';
export { MultiStepWizard } from './multi-step-wizard';
export { CountdownBadge } from './countdown-badge';
