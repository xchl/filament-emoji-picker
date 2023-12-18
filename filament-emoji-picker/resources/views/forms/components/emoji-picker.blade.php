@php
    use Filament\Support\Facades\FilamentAsset
@endphp
<x-dynamic-component
    :component="$getFieldWrapperView()"
    :field="$field"
>
    <div
        ax-load="visible"
        ax-load-src="{{FilamentAsset::getAlpineComponentSrc('emoji-picker-element','xuliang/filament-emoji-picker')}}"
        x-data="emojiPickerElement({
            state: $wire.entangle('{{ $getStatePath() }}'),
            locale: @js(app()->getLocale())
        })"
        x-ignore
    >
        <div class="" id="picker"></div>
        <ui-popup placement="bottom-start">
            <x-filament::icon-button
                icon="heroicon-s-face-smile"
                label="New label"
            />
            <div
                class="z-50"
                wire:ignore
                x-ref="picker"
            ></div>
        </ui-popup>
    </div>

</x-dynamic-component>
