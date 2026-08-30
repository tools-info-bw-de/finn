export const settings = $state<{
	theme: 'light' | 'dark';
	mode: 'edit' | 'play';
}>({
	theme: 'light',
	mode: 'edit'
});
