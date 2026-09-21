import gulp from 'gulp';
import less from 'gulp-less';
import cleanCSS from 'gulp-clean-css';
import rename from 'gulp-rename';
import browserSync from 'browser-sync';

const bs = browserSync.create();

const copyAdminFonts = () => gulp.src([
    'node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff2',
    'node_modules/@fontsource/montserrat/files/montserrat-latin-600-normal.woff2'
], { encoding: false }).pipe(gulp.dest('admin/styles/fonts'));

const compileLessRoot = () =>
    gulp.src('styles/style.min.less')
        .pipe(less())
        .pipe(cleanCSS())
        .pipe(rename('style.min.css'))
        .pipe(gulp.dest('styles'))
        .pipe(bs.stream());

const compileLessAdmin = () =>
    gulp.src('admin/styles/style.min.less')
        .pipe(less())
        .pipe(cleanCSS())
        .pipe(rename('style.min.css'))
        .pipe(gulp.dest('admin/styles'))
        .pipe(bs.stream());

export const buildAdmin = gulp.series(copyAdminFonts, compileLessAdmin);

const serve = (done) => {
    bs.init({
        proxy: 'http://localhost',
        startPath: '/jogartcg/',
        open: true,
        notify: false,
    });
    done();
};

const reload = (done) => {
    bs.reload();
    done();
};

const watchOpts = { usePolling: true, interval: 300 };

const watch = () => {
    gulp.watch(
        ['styles/**/*.less', 'pages/**/*.less', 'includes/**/*.less'],
        watchOpts,
        compileLessRoot
    );
    gulp.watch(
        ['admin/**/*.less', '!admin/node_modules/**'],
        watchOpts,
        compileLessAdmin
    );
    gulp.watch(
        ['**/*.php', 'pages/**/*.js', 'admin/**/*.js', 'scripts/**/*.js'],
        watchOpts,
        reload
    );
};

export default gulp.series(
    gulp.parallel(compileLessRoot, buildAdmin),
    serve,
    watch
);
