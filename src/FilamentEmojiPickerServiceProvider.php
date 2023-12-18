<?php
namespace Xuliang\FilamentEmojiPicker;

use Filament\Support\Assets\AlpineComponent;
use Filament\Support\Facades\FilamentAsset;
use Spatie\LaravelPackageTools\Package;

class FilamentEmojiPickerServiceProvider extends \Spatie\LaravelPackageTools\PackageServiceProvider
{
    public function configurePackage(Package $package): void
    {
        $package->name('filament-emoji-picker')->hasViews();
//            ->hasConfigFile()
//            ->hasViews()
//            ->hasAssets()
//            ->hasTranslations()
//            ->hasRoute('web')
//            ->hasRoute('api')
//            ->hasMigration('create_laravel_filament_emoji_picker_element_table');
    }

    public function packageBooted()
    {
        FilamentAsset::register([
            AlpineComponent::make(
                'emoji-picker-element',
                __DIR__.'/../dist/emoji-picker-element.js')
        ],'xuliang/filament-emoji-picker');
    }
}
